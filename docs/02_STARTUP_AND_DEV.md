# 02. Dokploy 本地开发启动与调试指南

---

### 一、 依赖工具与运行环境要求

在进行 Dokploy 的本地开发与调试前，必须安装并配置以下基础依赖：

1. **Node.js 运行环境**：
   - 官方要求及测试版本为 **Node.js v24.4.0**（根目录 `.nvmrc` 和 `package.json` 中的 `engines.node` 为 `"^24.4.0"`）。
   - 建议使用 `nvm` 管理：`nvm install 24.4.0 && nvm use`。

2. **包管理器 (Package Manager)**：
   - 项目采用 **pnpm**（指定版本为 `pnpm@10.22.0`）。
   - 开启 Corepack 安装对应版本：`corepack enable && corepack prepare pnpm@10.22.0 --activate`。

3. **Docker / Docker Swarm / Traefik**：
   - **Docker Desktop 或 Docker Engine**：Dokploy 核心调度通过 `dockerode` 与 Docker Socket 交互（支持原生 Docker API、Rancher Desktop、Colima 等 Socket 路径自动探测）。
   - **Docker Swarm 模式**：Dokploy 依赖 Docker Swarm。在 `dokploy:setup` 过程中会自动初始化集群（`docker swarm init`）并创建 overlay 虚拟网络 `dokploy-network`。
   - **Traefik 反向代理**：Dokploy 使用 Traefik（默认版本 `v3.6.7`）管理边缘路由及 SSL 证书申请。本地 setup 会自动拉取并启动 Traefik 容器服务。

4. **数据库与缓存服务**：
   - **PostgreSQL 16**：Dokploy 的主数据库（运行名为 `dokploy-postgres` 的 Swarm 服务），本地开发模式下映射宿主机 `5432` 端口。
   - **Redis 8**：存储任务队列及缓存（运行名为 `dokploy-redis` 的 Swarm 服务），本地开发模式下映射宿主机 `6379` 端口。

5. **构建工具与本地应用构建依赖（二开部署测试所需）**：
   - **C/C++ 原生编译依赖**：由于包含 `bcrypt`、`node-pty`、`ssh2` 等原生 C++ 扩展，必须安装 `python3`、`make`、`g++`、`pkg-config`、`libsecret-1-dev`。
   - **应用打包/构建 CLI**（在本地模拟部署应用时需要）：Nixpacks（`v1.41.0`）、Railpack（`v0.15.4`）、Buildpacks (`pack v0.39.1`) 以及 Rclone、Git LFS。

---

### 二、 pnpm Monorepo 结构与架构依赖关系

项目基于 pnpm workspace 构建，工作区配置文件为 `pnpm-workspace.yaml`。

```
dokploy/
├── apps/
│   ├── dokploy/        # [Web 主应用] Next.js 16 (React 19) + tRPC Server/Client + WebSocket
│   ├── api/            # [API 独立服务] Hono + Node HTTP Server + Ingest (端口 4000)
│   ├── schedules/      # [定时任务/队列服务] Hono + BullMQ + ioredis (端口 4001)
│   └── monitoring/     # [监控系统] 独立 Go 语言子模块 (SQLite/Docker-CLI，端口 3001)
├── packages/
│   └── server/         # [核心后端业务逻辑] @dokploy/server，被 apps/* 共享
└── Dockerfile*         # 容器化构建定义
```

#### 依赖架构关系：
1. **`packages/server` (`@dokploy/server`)**：
   - 核心后端 logic 包，包含 Dockerode API 封装、Drizzle ORM 数据模型、Traefik 配置文件生成器、Better-Auth 认证逻辑、SSH/Terminal 处理、BullMQ 部署队列等。
   - 被 `apps/dokploy`、`apps/api`、`apps/schedules` 通过 `workspace:*` 方式强依赖。
2. **`apps/dokploy` (`dokploy`)**：
   - 主仪表盘与后台管理服务，融合 Next.js 前端和 tRPC API，建立部署日志、终端 SSH、容器 Stats 的 WebSocket 通道。
3. **`apps/api` (`@dokploy/api`) & `apps/schedules` (`@dokploy/schedules`)**：
   - 解耦出的独立微服务，分别处理外部 REST API 请求和后台异步定时任务。
4. **`apps/monitoring`**：
   - 采用 Go 编写的轻量级主机/容器资源监控 Agent，通过 SQLite 存储监控指标（非 Node Workspace 模块）。

#### 开发态源码实时联调机制（关键设计）：
`packages/server` 提供了两个导出切换脚本：
- `pnpm --filter=server run switch:dev` (`node scripts/switchToSrc.js`)：动态修改 `packages/server/package.json` 的 `exports` 指向 `./src/index.ts`。在本地开发时，`apps/dokploy` 可直接读取 server 的 TypeScript 源码，支持热更新（HMR），无需每次手动 `pnpm build`！
- `pnpm --filter=server run switch:prod` (`node scripts/switchToDist.js`)：在正式 Build 时将导出恢复指向编译后的 `./dist/...`。

---

### 三、 本地开发环境启动完整步骤

#### Step 1: 克隆代码并切换至分支
```bash
git clone https://github.com/dokploy/dokploy.git
cd dokploy
git checkout canary   # 注意：PR 与日常开发统一基于 canary 分支
```

#### Step 2: 检查/安装环境
```bash
nvm install 24.4.0 && nvm use 24.4.0
pnpm install
```

#### Step 3: 配置环境变量 `.env`
复制配置模板文件：
```bash
cp apps/dokploy/.env.example apps/dokploy/.env
```
`apps/dokploy/.env` 基础配置内容：
```ini
DATABASE_URL="postgres://dokploy:amukds4wi9001583845717ad2@localhost:5432/dokploy"
PORT=3000
NODE_ENV=development
```

#### Step 4: 运行基础基础设施 Setup
```bash
pnpm run dokploy:setup
```
**`dokploy:setup` 内部自动执行全套初始化（核心逻辑位于 `apps/dokploy/setup.ts`）：**
1. 创建本地配置目录结构：开发模式下创建项目根目录下的 `./.docker`（用于存放 Traefik 配置、应用日志、证书等）。
2. 生成默认 Traefik 全局配置 `traefik.yml` 及中间件配置 `middlewares.yml`。
3. 初始化本地 Docker Swarm 集群（`docker.swarmInit()`）。
4. 创建 Docker Overlay 虚拟网络 `dokploy-network`。
5. 拉取并启动独立的 Traefik 容器 (`dokploy-traefik`)。
6. 拉取并启动 Redis 服务 (`dokploy-redis`)，开发环境暴露主机 `6379` 端口。
7. 拉取并启动 PostgreSQL 数据库 (`dokploy-postgres`)，开发环境暴露主机 `5432` 端口。
8. 自动运行 Drizzle 数据库 Migration (`pnpm run migration:run`)，应用 `apps/dokploy/drizzle` 下的所有 SQL 变更。

#### Step 5: 开启 Server 包源码联调
```bash
pnpm run server:script
```
该命令将 `@dokploy/server` 的导出切换为 `./src` 源码路径。

#### Step 6: 启动本地开发 Dev Server
```bash
pnpm run dokploy:dev
```
启动后访问：
- **Web UI**：`http://localhost:3000` 或 `http://dokploy.docker.localhost`
- **Traefik Dashboard**：`http://localhost:8080` (若在附加端口中开启)

---

### 四、 容器化构建与运行说明

Dokploy 针对不同的发布与部署形态提供了多个 Dockerfile：

| Dockerfile 路径 | 对应应用 | 构建与运行特点 |
| :--- | :--- | :--- |
| **`Dockerfile`** | 主应用 (Dokploy Standalone) | 多阶段构建 (`node:24.4.0-slim`)。自动打包 `@dokploy/server` 及 Next.js 产物。在最终运行镜像中集成了 Docker CLI、Rclone、Nixpacks、Railpack、Buildpacks (`pack`)、Git LFS 等核心构建与运维工具。入口脚本会依次校验 Postgres 连通性、执行 DB 迁移、启动 Node 服务。 |
| **`Dockerfile.cloud`** | Dokploy SaaS/Cloud 版 | 精简版镜像，移除本地 Docker/Nixpacks 构建依赖，集成 Stripe 环境变量，专为 Multi-tenant / Cloud 架构设计。 |
| **`Dockerfile.server`** | `apps/api` (REST API 微服务) | 构建打包 `@dokploy/api` 的 Hono 运行实例，对外暴露 4000 端口。 |
| **`Dockerfile.schedule`** | `apps/schedules` (定时/队列微服务) | 构建打包 `@dokploy/schedules`，基于 BullMQ 处理后台部署及轮询任务。 |
| **`Dockerfile.monitoring`** | `apps/monitoring` (Go 监控服务) | 基于 `golang:1.21-alpine` 构建二进制可执行文件 `main`，最终在轻量 `alpine:3.19` 镜像中运行（挂载 SQLite 和 Docker CLI，监听 3001 端口）。 |

#### 本地 Docker 构建命令：
```bash
# 配置生产构建环境变量
cp apps/dokploy/.env.production.example .env.production
cp apps/dokploy/.env.production.example apps/dokploy/.env.production

# 构建 Canary / Production 镜像
pnpm run docker:build:canary
```

---

### 五、 二次开发（二开）调试建议与常见坑点

#### 1. Docker Socket 权限问题 (Permission Denied)
- **现象**：`dokploy:setup` 或 `dokploy:dev` 抛出 `connect EACCES /var/run/docker.sock`。
- **解决方法**：
  - Linux 下将当前用户加入 docker 组：`sudo usermod -aG docker $USER` 并重新登录。
  - macOS / Rancher Desktop / Colima 下检查 Socket 映射。Dokploy 会自动检测 `~/.rd/docker.sock` 或 `DOCKER_HOST` 环境变量，如果使用非标准 Socket，在启动前声明 `DOCKER_HOST=unix:///path/to/your/docker.sock`。

#### 2. 开发环境与生产环境配置路径陷阱 (`.docker` vs `/etc/dokploy`)
- **分析**：在 `packages/server/src/constants/index.ts` 中：
  ```typescript
  const BASE_PATH = isServer || process.env.NODE_ENV === "production"
    ? "/etc/dokploy"
    : path.join(process.cwd(), ".docker");
  ```
- **坑点**：如果在本地开发时不小心将 `NODE_ENV` 设成了 `production`，程序会尝试往宿主机 `/etc/dokploy` 写入配置，由于非 root 权限会导致报 `EACCES: permission denied` 错误。本地二开务必保持 `NODE_ENV=development`。

#### 3. 修改 `@dokploy/server` 代码未生效
- **原因**：Next.js 可能在引用 `@dokploy/server` 的编译产物 `dist` 而不是 TypeScript 源码。
- **排查**：检查 `packages/server/package.json` 中的 `exports` 字段是否指向 `./src/index.ts`。如未指向，再次运行 `pnpm run server:script` 重置导出。

#### 4. 数据库 Schema 修改与 Migration 调试流程
- 当在 `packages/server/src/db/schema/` 中添加或修改字段后：
  1. 生成迁移 SQL 文件：
     ```bash
     pnpm --filter=dokploy run migration:generate
     ```
  2. 执行迁移更新本地数据库：
     ```bash
     pnpm --filter=dokploy run migration:run
     ```
  3. 可使用 Drizzle Studio 可视化查看/操作本地数据库：
     ```bash
     pnpm --filter=dokploy run studio
     ```

#### 5. Docker Swarm 服务与端口冲突
- Dokploy 依赖端口 `5432` (Postgres)、`6379` (Redis)、`80/443` (Traefik)。
- **坑点**：如果本地宿主机已经运行了本地 PostgreSQL/Redis 或 Nginx/Apache 占用了这些端口，`dokploy:setup` 启动 Docker Swarm Service 时会报错。在运行 setup 前请确保本地 5432/6379/80 端口未被占用。

#### 6. 代码规范与 Formatting (Biome)
- 项目使用 **Biome** 代替 Prettier 与 ESLint。提交代码或 PR 前运行以下命令修正代码规范：
  ```bash
  pnpm run format-and-lint:fix
  pnpm run typecheck
  ```

#### 7. Webhook 本地联调小工具
- 如需调试 GitHub/GitLab Webhook，官方推荐使用 `localtunnel` 将本地 3000 端口映射到公网：
  ```bash
  pnpm dlx localtunnel --port 3000
  ```
- 若忘记管理员密码，可执行内置命令重置：
  ```bash
  pnpm --filter=dokploy run reset-password
  ```
