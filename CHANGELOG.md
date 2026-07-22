# CHANGELOG.md - Dokploy 二次开发变更日志

仅记录具备实质价值的代码二次开发（核心功能、架构调整、合并冲突等）。

---

## [2026-07-22] - Dokploy 二次开发独立发布与核心功能解耦定制

### 1. 独立镜像源与构建/更新发布流定制 (Custom Release & Docker Registry)
- **修改文件**：
  - `.github/workflows/dokploy.yml`
  - `.github/workflows/create-pr.yml`
  - `script/install.sh`
  - `apps/dokploy/docker/build.sh`
  - `apps/dokploy/docker/push.sh`
  - `apps/dokploy/server/api/routers/settings.ts`
  - `packages/server/src/services/settings.ts`
  - `apps/dokploy/components/dashboard/settings/web-server/update-server.tsx`
- **修改内容与背景**：全面将构建、发布与版本更新机制指向独立镜像源 `Rain-kl/dokploy` (`ghcr.io/rain-kl/dokploy`)。分支：`feat` 唯一主线（推送 `:feat` / `:latest` / `:version` 并打 GitHub Release）；`canary` 仅同步上游不构建；停用 `main` 与 promote PR。后台更新检测、控制台重载、Release Notes 与 `script/install.sh` 全线对齐。
- **上游侵入评估**：极小 (Low)。

### 2. 基础设施容器镜像精简 (Postgres & Redis/Valkey Optimization)
- **修改文件**：
  - `packages/server/src/setup/postgres-setup.ts`
  - `packages/server/src/setup/redis-setup.ts`
  - `packages/server/src/db/schema/postgres.ts`
  - `packages/server/src/db/schema/redis.ts`
  - `script/install.sh`
- **修改内容与背景**：将默认数据库镜像统一切换为 `postgres:16-alpine`；将 Redis 镜像统一切换为开源轻量的 `valkey/valkey:8-alpine`，大幅降低系统资源占用与基础设施容器体积。
- **上游侵入评估**：极小 (Low)。

### 3. 企业版 License 远程校验解除与功能全开 (Enterprise Features Unlock)
- **修改文件**：
  - `packages/server/src/services/proprietary/license-key.ts`
  - `packages/server/src/utils/crons/enterprise.ts`
  - `apps/dokploy/server/utils/enterprise.ts`
  - `packages/server/src/lib/auth.ts`
  - `apps/dokploy/server/api/routers/proprietary/sso.ts`
  - `apps/dokploy/server/api/routers/proprietary/license-key.ts`
- **修改内容与背景**：`hasValidLicense` 恒返回 `true`，禁用远程 `licenses-api.dokploy.com` 校验定时任务上报；解除 SCIM/SSO 对官方 License 的硬依赖，实现企业级高级功能在自托管场景下全部可用。
- **上游侵入评估**：微小 (Low) - 采用 `CUSTOM-FEATURE: [Unlock Enterprise]` 锚点隔离。

### 4. Traefik 反向代理依赖解耦 (Traefik Optional Decoupling)
- **修改文件**：
  - `packages/server/src/constants/env.ts`
  - `packages/server/src/constants/index.ts`
  - `packages/server/src/setup/traefik-setup.ts`
  - `packages/server/src/utils/traefik/application.ts`
  - `packages/server/src/utils/traefik/domain.ts`
  - `packages/server/src/services/settings.ts`
  - `packages/server/src/services/compose.ts`
  - `apps/dokploy/setup.ts`
  - `apps/dokploy/pages/dashboard/project/[projectId]/environment/[environmentId]/services/application/[applicationId].tsx`
  - `apps/dokploy/pages/dashboard/project/[projectId]/environment/[environmentId]/services/compose/[composeId].tsx`
- **修改内容与背景**：新增 `ENABLE_TRAEFIK` 控制开关（默认 `false`），跳过 `dokploy-traefik` 容器拉起与动态 YAML 生成，并在前端界面动态隐藏 Domains 标签页及 Traefik 设置，支持宿主机直接暴露端口。
- **上游侵入评估**：极小 (Low)。

### 5. 二次开发与 AI Agent 协作规范 (Development Governance)
- **修改文件**：
  - `AGENTS.md`
- **修改内容与背景**：确立低侵入式二开架构、最简代码原则、CHANGELOG 过滤标准、AI Agent 协作 check list 及上游合并冲突处理规范。
- **上游侵入评估**：零侵入 (Zero Impact)。
