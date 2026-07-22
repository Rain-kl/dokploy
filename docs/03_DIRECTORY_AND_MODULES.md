# 03. Dokploy 目录结构与核心模块划分手册

对 Dokploy 项目的源码结构、应用划分、共享包架构及核心功能模块源码映射进行深入解析，为二次开发提供精准的代码定位指南。

---

## 1. 根目录及全局配置文件说明

Dokploy 采用 **pnpm monorepo** 架构进行代码组织与依赖管理：

| 配置文件/路径 | 功能与职责说明 |
| :--- | :--- |
| `package.json` | Monorepo 根 package.json，定义工作区 (`apps/*`, `packages/*`)、全局脚本（如 `dokploy:dev`, `build`, `typecheck`, `format-and-lint` 等）以及全局 Node (>=24.4) / pnpm (>=10.22) 版本约束。 |
| `pnpm-workspace.yaml` | 声明 pnpm workspace 包含 `apps/*` 和 `packages/*`。 |
| `biome.json` | 代码格式化与 Lint 约束配置文件（取代 ESLint/Prettier）。 |
| `Dockerfile` | Dokploy 主应用 (`apps/dokploy`) 的生产环境多阶段 Docker 构建镜像文件。 |
| `Dockerfile.server` | `@dokploy/server` 的独立容器构建文件。 |
| `Dockerfile.monitoring` | 监控微服务 (`apps/monitoring`) 的 Go 镜像构建文件。 |
| `Dockerfile.schedule` | 定时任务队列服务 (`apps/schedules`) 的容器构建文件。 |
| `Dockerfile.cloud` | 多租户/云端版本的 Dokploy 构建镜像。 |
| `openapi.json` | 自动生成的 OpenAPI 规范文档（由 tRPC 端点导出）。 |
| `.nvmrc` | 统一开发人员与 CI 的 Node.js 版本（v24）。 |
| `CONTRIBUTING.md` / `GUIDES.md` | 开发者贡献指南与运行设置说明。 |

---

## 2. `apps/` 下各个应用目录结构与入口分析

`apps/` 目录下共有 4 个子应用：

### 2.1 `apps/dokploy`（Dokploy 主 Console 与核心 HTTP Server）
- **定位**：Dokploy 核心控制台 UI (Next.js 16 + React 19) + 核心 Node HTTP 服务器 + WebSocket 实时通信 + tRPC 路由服务 + 部署 Worker。
- **入口文件**：
  - `apps/dokploy/server/server.ts`：服务器主入口。在此初始化 Traefik 目录、启动 HTTP 监听 (默认 3000 端口)、挂载 WebSocket 服务、启动 BullMQ 部署 Worker (`queueSetup.ts`) 以及注册 Cron 定时任务。
  - `apps/dokploy/pages/` / `components/`：Next.js 前端路由与 Shadcn/Radix UI 组件。
  - `apps/dokploy/setup.ts` & `migration.ts`：系统首次安装初始化与数据库 Migration 脚本。
  - `apps/dokploy/reset-password.ts` / `reset-2fa.ts`：CLI 命令行重置管理员密码与双重验证 (2FA) 脚本。
- **目录划分**：
  - `server/api/routers/`：所有 tRPC 接口路由（用户、应用、数据库、域名、Traefik、部署等）。
  - `server/queues/`：BullMQ 任务队列与 Worker（应用部署队列处理）。
  - `server/wss/`：各类 WebSocket 实时长连接服务（终端 SSH、容器日志、部署日志等）。

### 2.2 `apps/api`（轻量级 Hono API 微服务）
- **定位**：基于 Hono 框架与 Inngest 的轻量级 HTTP API 接口服务。
- **入口文件**：`apps/api/src/index.ts`（默认运行于 4000 端口）。
- **主要作用**：提供高性能事件驱动的独立 API 接口。

### 2.3 `apps/monitoring`（Go 语言高性能监控微服务）
- **定位**：采用 Go 语言 (Fiber 框架 + SQLite) 编写的独立服务器/容器资源监控与告警服务。
- **入口文件**：`apps/monitoring/main.go`（默认运行于 3001 端口）。
- **内部划分**：
  - `containers/`：收集 Docker 容器 CPU/Memory/Disk/Network 统计指标。
  - `monitoring/`：收集宿主机 CPU/Memory/Disk 指标，并进行阀值检查 (`CheckThresholds`)。
  - `database/`：使用 SQLite (`InitDB()`) 存储指标，支持按 Retention Days 自动清理过期数据。
  - `middleware/`：Auth Token 校验中间件。

### 2.4 `apps/schedules`（定时任务与 Worker 微服务）
- **定位**：基于 Hono + BullMQ + ioredis 的独立定时任务调度服务。
- **入口文件**：`apps/schedules/src/index.ts`（默认运行于 4001 端口）。
- **核心文件**：`queue.ts`（队列定义）、`workers.ts`（任务消费者）、`utils.ts`（任务调度与计算逻辑）。

---

## 3. `packages/` 下共享包的功能定位与模块接口

项目中的核心底层逻辑、数据库 Schema、Docker 交互、Traefik 配置生成等均收录在 `packages/server` 统一 Workspace 包（名称 `@dokploy/server`）中。

### `@dokploy/server` (`packages/server/src/`) 架构与关键子目录：

1. **`src/db/`（数据库层）**
   - 使用 **Drizzle ORM** 操作 PostgreSQL。
   - `src/db/schema/`：全量数据表定义，包含 `user.ts`, `application.ts`, `postgres.ts`, `mysql.ts`, `mariadb.ts`, `mongo.ts`, `redis.ts`, `libsql.ts`, `domain.ts`, `certificate.ts`, `deployment.ts`, `schedule.ts`, `notification.ts` 等 40+ 个 Schema 文件。
2. **`src/lib/`（底层基础设施与鉴权）**
   - `lib/auth.ts`：**Better-Auth** 核心配置（Session, API Keys, 2FA, SSO, SCIM）。
   - `lib/access-control.ts`：RBAC 权限控制与策略定义。
   - `lib/encryption.ts`：敏感环境变量与凭据的 AES 加解密工具。
3. **`src/services/`（业务逻辑 Service 层）**
   - 包含绝大部分核心业务处理函数，如 `application.ts` (应用管理), `deployment.ts` (部署状态与流水线), `docker.ts` (Docker 操作), `domain.ts` & `certificate.ts` (域名与证书), `postgres.ts`/`mysql.ts`/`redis.ts` (数据库部署管理), `notification.ts` (告警通知 dispatch)。
4. **`src/utils/`（核心工具库与构建/配置引擎）**
   - `utils/builders/`：**多构建引擎实现**（`docker-file.ts`, `nixpacks.ts`, `heroku.ts`, `railpack.ts`, `paketo.ts`, `compose.ts`, `static.ts`）。
   - `utils/traefik/`：**Traefik 动态配置文件生成器**（`application.ts`, `domain.ts`, `middleware.ts`, `security.ts`）。
   - `utils/docker/`：Low-level Dockerode 封装、Swarm 节点/服务管理、容器创建与卷/网络管理。
   - `utils/databases/`：PostgreSQL/MySQL/Redis 等一键部署容器参数与卷挂载生成。
   - `utils/notifications/`：Telegram, Slack, Discord, Email, Webhook 多渠道消息推送。
   - `utils/providers/`：GitHub, GitLab, Bitbucket, Gitea Git 平台 OAuth 与 API 交互。

---

## 4. 核心功能模块源码精准定位指南 (二开快速定位)

### ① 用户鉴权与 Session / Token / 权限
| 功能子项 | 核心文件路径 | 关键说明 |
| :--- | :--- | :--- |
| Better-Auth 配置 | `packages/server/src/lib/auth.ts` | 包含 Session 保存、API Key 插件、SSO/SCIM 扩展。 |
| 用户与 Token Schema | `packages/server/src/db/schema/user.ts`<br>`packages/server/src/db/schema/session.ts`<br>`packages/server/src/db/schema/account.ts` | 用户表、Session 存储、OAuth 绑定表。 |
| RBAC 权限控制 | `packages/server/src/lib/access-control.ts`<br>`packages/server/src/services/permission.ts` | 角色（Admin/Member/User）与资源访问策略控制。 |
| CLI 重置密码/2FA | `apps/dokploy/reset-password.ts`<br>`apps/dokploy/reset-2fa.ts` | 紧急恢复管理员权限命令行脚本。 |
| 鉴权 API Router | `apps/dokploy/server/api/routers/user.ts`<br>`apps/dokploy/server/api/routers/admin.ts` | 前端调用的用户与管理 API。 |

### ② 应用/服务部署流程引擎 (Build, Deploy, Git Integration)
| 功能子项 | 核心文件路径 | 关键说明 |
| :--- | :--- | :--- |
| 部署任务队列 | `apps/dokploy/server/queues/queueSetup.ts`<br>`apps/dokploy/server/queues/deploy-queue.ts` | BullMQ 异步部署任务派发与 Worker 监听。 |
| 部署流程编排 Service | `packages/server/src/services/deployment.ts`<br>`packages/server/src/services/application.ts` | 部署触发、步骤记录、日志追加、镜像打包与容器拉起。 |
| 多类型构建引擎 | `packages/server/src/utils/builders/index.ts`<br>`docker-file.ts` (Dockerfile)<br>`nixpacks.ts` (Nixpacks)<br>`heroku.ts` / `railpack.ts` / `paketo.ts` (Buildpacks)<br>`compose.ts` (Docker Compose) | 依据配置调用对应的 CLI 工具将源码构建为 Docker 镜像或 Compose 服务。 |
| Git 供应商集成 | `packages/server/src/services/github.ts`<br>`gitlab.ts` / `bitbucket.ts` / `gitea.ts`<br>`packages/server/src/utils/providers/` | Git 代码拉取、分支列表获取、Commit Hash 解析。 |
| 版本回滚 | `packages/server/src/services/rollbacks.ts` | 历史部署记录回滚与旧容器重新拉起。 |

### ③ 数据库 / Redis / MinIO 等基础设施一键部署
| 功能子项 | 核心文件路径 | 关键说明 |
| :--- | :--- | :--- |
| 基础设施一键部署 Service | `packages/server/src/services/postgres.ts`<br>`mysql.ts` / `mariadb.ts` / `mongo.ts` / `redis.ts` / `libsql.ts` | 基础设施数据库增删改查与运行控制。 |
| 数据库容器参数生成 | `packages/server/src/utils/databases/`<br>(`postgres.ts`, `mysql.ts`, `redis.ts` 等) | 生成带有环境变量、持久化 Volume、网络配置的 Docker Container Spec。 |
| 数据库数据表 Schema | `packages/server/src/db/schema/postgres.ts` 等 | 存储基础设施数据库的元数据与凭据。 |
| 自动备份与恢复 | `packages/server/src/services/backup.ts`<br>`volume-backups.ts`<br>`packages/server/src/utils/backups/`<br>`packages/server/src/utils/restore/` | 数据库全量 Dump 备份至 S3/MinIO/SSH 及恢复逻辑。 |

### ④ Traefik 路由与 SSL 证书自动配置
| 功能子项 | 核心文件路径 | 关键说明 |
| :--- | :--- | :--- |
| Traefik 动态配置生成引擎 | `packages/server/src/utils/traefik/application.ts`<br>`domain.ts`<br>`middleware.ts`<br>`security.ts` | 根据应用与域名设置动态生成 Traefik 的 YAML/JSON 配置文件。 |
| 域名与证书 Service | `packages/server/src/services/domain.ts`<br>`packages/server/src/services/certificate.ts` | 域名绑解析、ACME / Let's Encrypt SSL 证书申请与更新。 |
| Traefik 初始化 | `packages/server/src/setup/traefik-setup.ts`<br>`packages/server/src/utils/traefik/web-server.ts` | 部署 Dokploy 时自动安装并初始化 Traefik 容器与其网关配置。 |

### ⑤ Webhook & 实时日志 / 终端 (WebSocket / SSH)
| 功能子项 | 核心文件路径 | 关键说明 |
| :--- | :--- | :--- |
| Git Webhook 接收端点 | `apps/dokploy/pages/api/deploy/[refreshToken].ts`<br>`apps/dokploy/pages/api/deploy/github.ts`<br>`apps/dokploy/pages/api/providers/` | 接收 GitHub / GitLab / Bitbucket 的 Push / PR 事件并自动触发部署。 |
| WebSocket 注册中心 | `apps/dokploy/server/server.ts` | 将各个 WebSocket Handler 绑定到 HTTP Server。 |
| 部署日志长连接 | `apps/dokploy/server/wss/listen-deployment.ts` | 实时推送部署日志流至 Web 界面。 |
| 容器日志长连接 | `apps/dokploy/server/wss/docker-container-logs.ts` | 流式读取并传输 Docker 容器 stdout/stderr。 |
| Web Terminal (容器 Exec) | `apps/dokploy/server/wss/docker-container-terminal.ts` | 基于 node-pty / xterm.js 的 Docker exec 交互式 Shell。 |
| Web Terminal (宿主机 SSH) | `apps/dokploy/server/wss/terminal.ts` | 基于 ssh2 库连接宿主机或远程服务器的终端。 |
| 容器资源实时 Monitoring | `apps/dokploy/server/wss/docker-stats.ts` | 实时推送容器 CPU/内存/网络使用统计。 |

### ⑥ 定时任务与监控报警
| 功能子项 | 核心文件路径 | 关键说明 |
| :--- | :--- | :--- |
| Go 语言资源采集与告警 | `apps/monitoring/main.go`<br>`apps/monitoring/monitoring/`<br>`apps/monitoring/containers/` | 周期性采集宿主机与容器 CPU/RAM/Disk 并在超限时触发 Callback。 |
| 定时任务 Worker | `apps/schedules/src/index.ts`<br>`apps/schedules/src/queue.ts`<br>`apps/schedules/src/workers.ts` | 基于 Cron 表达式调度数据库备份、清理等后台任务。 |
| 定时任务 Service | `packages/server/src/services/schedule.ts`<br>`packages/server/src/utils/schedules/` | 管理系统内部 Cron Jobs 与用户自定义定时任务。 |
| 多通道告警 Notification | `packages/server/src/services/notification.ts`<br>`packages/server/src/utils/notifications/` (`telegram.ts`, `slack.ts`, `discord.ts`, `email.ts`, `webhook.ts`) | 部署失败/完成、资源超限、服务重启时向各大平台发送 Alert 消息。 |

---

### 💡 二次开发推荐工作流建议：
1. **修改 API 接口**：在 `apps/dokploy/server/api/routers/` 找到对应模块的 tRPC Router 增加/修改过程方法。
2. **扩展数据表 Schema**：在 `packages/server/src/db/schema/` 中修改或新增 Schema 文件，执行 `pnpm --filter=dokploy migration:generate` 自动生成 Migration。
3. **扩展构建逻辑**：在 `packages/server/src/utils/builders/` 中增加自定义 Builder 并在 `packages/server/src/services/deployment.ts` 中完成调度。
4. **修改 Traefik 路由规则**：修改 `packages/server/src/utils/traefik/` 下的配置生成文件。
