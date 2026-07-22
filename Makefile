.PHONY: help setup dev clean typecheck format status

# 默认目标：显示帮助信息
help:
	@echo "======================================================================"
	@echo "                   Dokploy 二次开发常用命令 (Makefile)"
	@echo "======================================================================"
	@echo "  make setup     - 初始化开发环境 (复制 .env, 依赖安装, 基础设施 setup, 源码联动)"
	@echo "  make clean     - 清理开发环境 (清理 Docker Swarm 服务、网络与 .docker 本地缓存)"
	@echo "  make dev       - 启动本地开发服务 (pnpm run dokploy:dev)"
	@echo "  make typecheck - 运行 TypeScript 类型检查 (pnpm run typecheck)"
	@echo "  make format    - 运行代码规范修复与 Lint (pnpm run format-and-lint:fix)"
	@echo "  make status    - 查看 Dokploy 相关的 Docker Swarm 服务与容器状态"
	@echo "======================================================================"

# 初始化开发环境
setup:
	@echo "--> [1/4] 检查并配置环境变量 (.env)..."
	@if [ ! -f apps/dokploy/.env ]; then \
		cp apps/dokploy/.env.example apps/dokploy/.env && echo "已创建 apps/dokploy/.env"; \
	else \
		echo "apps/dokploy/.env 已存在，跳过"; \
	fi
	@echo "--> [2/4] 安装项目依赖..."
	@pnpm install
	@echo "--> [3/4] 初始化基础设施 (Swarm, Network, Postgres, Redis)..."
	@pnpm run dokploy:setup
	@echo "--> [4/4] 开启 @dokploy/server 源码热更新联动..."
	@pnpm run server:script
	@echo "✅ 开发环境初始化完成！运行 'make dev' 启动开发服务。"

# 清理环境 (彻底清理 Swarm 服务、Network 及 本地 .docker 目录)
clean:
	@echo "--> [1/3] 清理 Dokploy Swarm 服务与容器..."
	-docker service rm dokploy-postgres dokploy-redis dokploy-traefik dokploy 2>/dev/null || true
	@echo "--> [2/3] 清理 Dokploy Overlay 网络..."
	-docker network rm dokploy-network 2>/dev/null || true
	@echo "--> [3/3] 清理本地缓存目录 (.docker)..."
	-rm -rf .docker apps/dokploy/.docker 2>/dev/null || true
	@echo "✅ 环境清理完成！"

# 启动开发服务
dev:
	pnpm run dokploy:dev

# 类型检查
typecheck:
	pnpm run typecheck

# 格式化与代码规范修复
format:
	pnpm run format-and-lint:fix

# 查看 Docker 服务与容器状态
status:
	@echo "=== Docker Services ==="
	-docker service ls --filter "name=dokploy"
	@echo "=== Docker Containers ==="
	-docker ps --filter "name=dokploy"
