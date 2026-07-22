# Dokploy 二次开发指南 (Secondary Development Guide)

欢迎使用 Dokploy 二次开发指南。本文档汇总了项目架构、启动与本地调试流程以及完整的目录结构与核心模块定位，旨在帮助开发者快速熟悉 Dokploy 源码并高效开展二次开发。

---

## 📚 文档目录

1. [**01. 总体架构与技术栈分析 (`docs/01_ARCHITECTURE.md`)**](./01_ARCHITECTURE.md)
   - Monorepo 拆分与组件职责 (`apps/` vs `packages/`)
   - 前后端与数据库技术栈选型
   - 核心基础设施交互机制（Docker API, Traefik 动态 YAML, BullMQ 队列, Go 监控）
   - 系统通讯模型与端到端数据流

2. [**02. 本地开发启动与调试指南 (`docs/02_STARTUP_AND_DEV.md`)**](./02_STARTUP_AND_DEV.md)
   - 开发环境与依赖工具要求 (Node v24, pnpm v10, Docker Swarm)
   - pnpm Monorepo 结构与源码热更新（HMR）联动设置
   - 本地开发启动 Step-by-Step 教程 (`pnpm run dokploy:setup` / `dev`)
   - 数据库 Schema 修改与 Drizzle Migration 调试
   - 多 Dockerfile 构建说明与二开常见坑点避坑指南

3. [**03. 目录结构与核心模块定位手册 (`docs/03_DIRECTORY_AND_MODULES.md`)**](./03_DIRECTORY_AND_MODULES.md)
   - 根目录与配置文件全解析
   - `apps/` 四大微服务 (Dokploy Main, API, Schedules, Monitoring) 源码结构
   - `packages/server` 共享包模块全景图
   - 二开核心功能源码精准定位字典（用户鉴权、部署引擎、数据库部署、Traefik 路由配置、WebSocket 实时终端与日志、监控告警）

---

## 🚀 快速上手二开

```bash
# 1. 克隆并进入项目开发分支 (canary)
git clone https://github.com/dokploy/dokploy.git
cd dokploy
git checkout canary

# 2. 检查并切至指定 Node 版本 (Node v24.4.0, pnpm 10)
nvm use 24.4.0
pnpm install

# 3. 配置环境变量
cp apps/dokploy/.env.example apps/dokploy/.env

# 4. 初始化基础设施 (Swarm, Traefik, DB, Redis)
pnpm run dokploy:setup

# 5. 开启 @dokploy/server 源码热更新联动
pnpm run server:script

# 6. 启动本地 Dev Server
pnpm run dokploy:dev
```

详细信息请参阅上述各分册文档。
