#!/bin/bash

# ==============================================================================
# Dokploy 二次开发版本一键安装与更新脚本 (Rain-kl/dokploy)
# ==============================================================================

DOCKER_VERSION="28.5.0"
# 支持通过环境变量 DOKPLOY_IMAGE_REPO 自定义 Docker 镜像源，默认使用 ghcr.io/rain-kl/dokploy
DOKPLOY_IMAGE_REPO="${DOKPLOY_IMAGE_REPO:-ghcr.io/rain-kl/dokploy}"

# 检测 GitHub 版本或环境变量指定版本
detect_version() {
    local version="${DOKPLOY_VERSION}"
    
    if [ -z "$version" ]; then
        echo "正在从 GitHub (Rain-kl/dokploy) 自动检测最新 Release 版本..." >&2
        
        version=$(curl -fsSL --connect-timeout 10 -o /dev/null -w '%{url_effective}\n' \
            https://github.com/Rain-kl/dokploy/releases/latest 2>/dev/null | \
            sed 's#.*/tag/##')

        case "$version" in
            v[0-9]*) ;;
            *) version="" ;;
        esac

        if [ -z "$version" ]; then
            echo "提示: 未检测到官方 Release 标签，默认使用最新镜像 Tag (latest)" >&2
            version="latest"
        else
            echo "检测到最新发布版本: $version" >&2
        fi
    fi
    
    echo "$version"
}

# 随机生成安全 Auth 秘钥
generate_random_password() {
    local password=""
    if command -v openssl >/dev/null 2>&1; then
        password=$(openssl rand -hex 32)
    elif [ -r /dev/urandom ]; then
        password=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32)
    else
        password=$(echo "$(date +%s%N)-$(hostname)-$$-$RANDOM" | base64 | tr -d "=+/" | head -c 32)
    fi
    echo "$password"
}

install_dokploy() {
    VERSION_TAG=$(detect_version)
    DOCKER_IMAGE="${DOKPLOY_IMAGE_REPO}:${VERSION_TAG}"
    
    echo "======================================================================"
    echo " 开始部署 Rain-kl/dokploy (镜像: ${DOCKER_IMAGE})"
    echo "======================================================================"

    if [ "$(id -u)" != "0" ]; then
        echo "错误: 本安装脚本必须以 root 权限运行" >&2
        exit 1
    fi

    if [ "$(uname)" = "Darwin" ]; then
        echo "错误: 生产部署脚本仅支持 Linux 系统，本地 macOS 请使用 'make setup' 进行二开调试" >&2
        exit 1
    fi

    if [ -f /.dockerenv ]; then
        echo "错误: 脚本不能在 Docker 容器内部运行" >&2
        exit 1
    fi

    # 检查 3000 端口占用
    if ss -tulnp | grep ':3000 ' >/dev/null 2>&1; then
        echo "错误: 宿主机 3000 端口已被占用，请先停止占用该端口的服务" >&2
        exit 1
    fi

    # 安装/检查 Docker
    if ! command -v docker >/dev/null 2>&1; then
        echo "正在安装 Docker..."
        curl -fsSL https://get.docker.com | sh -s -- --version "${DOCKER_VERSION}"
    fi

    # 初始化 Docker Swarm
    if ! docker info --format '{{.Swarm.LocalNodeState}}' | grep -q "active"; then
        echo "初始化 Docker Swarm..."
        PRIMARY_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
        if [ -n "$PRIMARY_IP" ]; then
            docker swarm init --advertise-addr "$PRIMARY_IP" || docker swarm init || true
        else
            docker swarm init || true
        fi
    fi

    # 创建 overlay 网络
    if ! docker network ls | grep -q "dokploy-network"; then
        echo "创建 dokploy-network 网络..."
        docker network create --driver overlay --attachable dokploy-network || true
    fi

    # 创建配置目录与 Docker Secrets 加密存储
    mkdir -p /etc/dokploy
    chmod 777 /etc/dokploy

    POSTGRES_PASSWORD=$(generate_random_password)
    echo "$POSTGRES_PASSWORD" | docker secret create dokploy_postgres_password - 2>/dev/null || true

    AUTH_SECRET=$(generate_random_password)
    echo "$AUTH_SECRET" | docker secret create dokploy_auth_secret - 2>/dev/null || true
    echo "$AUTH_SECRET" > /etc/dokploy/auth_secret 2>/dev/null || true
    chmod 600 /etc/dokploy/auth_secret 2>/dev/null || true

    # 启动 Valkey 8 Alpine 容器服务
    if ! docker service ls | grep -q "dokploy-redis"; then
        echo "启动 dokploy-redis (Valkey 8 Alpine) 服务..."
        docker service create \
            --name dokploy-redis \
            --constraint 'node.role==manager' \
            --network dokploy-network \
            --mount type=volume,source=dokploy-redis,target=/data \
            valkey/valkey:8-alpine || true
    fi

    # 启动 Postgres 16 Alpine 容器服务
    if ! docker service ls | grep -q "dokploy-postgres"; then
        echo "启动 dokploy-postgres (Postgres 16 Alpine) 服务..."
        docker service create \
            --name dokploy-postgres \
            --constraint 'node.role==manager' \
            --network dokploy-network \
            --env POSTGRES_USER=dokploy \
            --env POSTGRES_DB=dokploy \
            --secret source=dokploy_postgres_password,target=/run/secrets/postgres_password \
            --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password \
            --env POSTGRES_PASSWORD=amukds4wi9001583845717ad2 \
            --mount type=volume,source=dokploy-postgres,target=/var/lib/postgresql/data \
            postgres:16-alpine || true
    fi

    # 拉取并启动 Dokploy 服务
    echo "拉取最新 Dokploy 镜像 (${DOCKER_IMAGE})..."
    docker pull "${DOCKER_IMAGE}"

    if docker service ls | grep -q "dokploy"; then
        echo "更新已有 Dokploy 服务镜像..."
        IMAGE_DIGEST=$(docker image inspect --format='{{index .RepoDigests 0}}' "${DOCKER_IMAGE}" 2>/dev/null || true)
        if [ -n "$IMAGE_DIGEST" ]; then
            docker service update --image "${IMAGE_DIGEST}" --force --with-registry-auth dokploy
        else
            docker service update --image "${DOCKER_IMAGE}" --force --with-registry-auth dokploy
        fi
    else
        echo "创建并拉起 Dokploy Swarm 服务..."
        docker service create \
            --name dokploy \
            --replicas 1 \
            --constraint 'node.role==manager' \
            --network dokploy-network \
            --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock \
            --mount type=bind,source=/etc/dokploy,target=/etc/dokploy \
            --mount type=volume,source=dokploy,target=/root/.docker \
            --secret source=dokploy_postgres_password,target=/run/secrets/postgres_password \
            --secret source=dokploy_auth_secret,target=/run/secrets/dokploy_auth_secret \
            --publish published=3000,target=3000,mode=host \
            --update-parallelism 1 \
            --update-order stop-first \
            --env PORT=3000 \
            --env NODE_ENV=production \
            --env ENABLE_TRAEFIK=false \
            --env RELEASE_TAG="${VERSION_TAG}" \
            --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password \
            --env BETTER_AUTH_SECRET_FILE=/run/secrets/dokploy_auth_secret \
            "${DOCKER_IMAGE}"
    fi

    echo "======================================================================"
    echo "🎉 Rain-kl/dokploy 部署成功！"
    echo "访问地址: http://<你的服务器IP>:3000"
    echo "======================================================================"
}

update_dokploy() {
    VERSION_TAG=$(detect_version)
    DOCKER_IMAGE="${DOKPLOY_IMAGE_REPO}:${VERSION_TAG}"

    echo "更新 Rain-kl/dokploy 至版本: ${VERSION_TAG}..."
    docker pull "${DOCKER_IMAGE}"

    # Swarm pins Image as name:tag@sha256:... After a same-tag rebuild, --image name:tag
    # alone often keeps the old digest (no real rollout). Resolve the just-pulled digest
    # and force a new task so the running container always matches the pulled image.
    IMAGE_DIGEST=$(docker image inspect --format='{{index .RepoDigests 0}}' "${DOCKER_IMAGE}" 2>/dev/null || true)
    if [ -n "$IMAGE_DIGEST" ]; then
        echo "使用已拉取镜像 digest: ${IMAGE_DIGEST}"
        docker service update \
            --image "${IMAGE_DIGEST}" \
            --force \
            --with-registry-auth \
            dokploy
    else
        echo "警告: 未能解析 RepoDigest，回退为 --force 更新 tag..."
        docker service update \
            --image "${DOCKER_IMAGE}" \
            --force \
            --with-registry-auth \
            dokploy
    fi

    echo "当前服务镜像:"
    docker service inspect dokploy --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' 2>/dev/null || true
    echo "🎉 Rain-kl/dokploy 更新完成！"
}

if [ "$1" = "update" ]; then
    update_dokploy
else
    install_dokploy
fi
