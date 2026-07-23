# CHANGELOG.md - Dokploy 二次开发变更日志

仅记录具备实质价值的代码二次开发（核心功能、架构调整、合并冲突等）。

---

## [2026-07-23] - keepLatest 按任务保留 + 失败日志标明库名

- **修改文件**：`packages/server/src/utils/backups/index.ts`, `packages/server/src/custom/backups/keep-latest-by-run.ts`, `append-backup-log.ts`, 各 `run*Backup`
- **修改内容**：`keepLatestCount` 按共享 timestamp 的一次任务（run）保留，多库同次备份整组删除/保留；失败时 deployment log 写入失败库名
- **上游侵入评估**：微小 (Low)

## [2026-07-23] - 二开 Migration 独立链 (drizzle-custom)

- **修改文件**：`apps/dokploy/migration.ts`, `apps/dokploy/drizzle-custom/*`, `Dockerfile`, `Dockerfile.cloud`；移除主链 `drizzle/0175_*`
- **修改内容**：二开 DDL 走 `drizzle-custom` + 表 `drizzle_migrations_custom`，与上游 `drizzle/` 序号隔离
- **功能与背景**：避免 `git pull upstream` 时 migration idx/tag 必冲突
- **上游侵入评估**：微小 (Low) — migration.ts 挂钩 + 镜像 COPY 一行

## [2026-07-23] - Multi-database backup selection

- **修改文件**：`packages/server/src/db/schema/backups.ts`, `packages/server/src/custom/backups/*`, `packages/server/src/utils/backups/*`, `packages/server/src/services/backup.ts`, `apps/dokploy/server/api/routers/backup.ts`, `apps/dokploy/components/dashboard/database/backups/*`, `apps/dokploy/drizzle-custom/*`
- **修改内容**：Backup 支持 `databases[]` 多选；容器 listDatabases + 手填；每库独立 dump 文件名；兼容旧 `database` 字段；DDL 进 custom migration 链
- **功能与背景**：一条备份计划可覆盖同实例多个逻辑库
- **上游侵入评估**：中等 (Medium) — schema/API/UI + 执行循环；list 逻辑在 custom/

## [2026-07-22] - SSO 绑定改为 OpenID→当前账户（禁止建用户/切号）

- **修改文件**：
  - `packages/server/src/custom/sso-account-link.ts`（新）
  - `apps/dokploy/pages/api/auth/[...all].ts`
  - `apps/dokploy/server/api/routers/proprietary/sso.ts`
  - `apps/dokploy/components/dashboard/settings/linking-account/linking-account.tsx`
  - `packages/server/package.json`
- **修改内容**：
  - Profile 绑定不再调用 `signIn.sso`（避免按邮箱找/建用户并切换会话）。
  - 新流程：将 IdP OpenID `sub` 写入 `account` 表并关联**当前登录用户**；不创建用户、不改 session。
  - 回调路径复用 `/api/auth/sso/callback/:providerId`，由自定义逻辑优先处理 link state。
- **功能与背景**：修复 admin@admin.com 绑定后被切到 SSO 邮箱账户、权限丢失的问题。
- **上游侵入评估**：微小 (Low) - auth 入口挂钩 + custom 隔离目录。

## [2026-07-22] - SSO 一键登录与 Profile 绑定

- **修改文件**：
  - `apps/dokploy/server/api/routers/proprietary/sso.ts`
  - `apps/dokploy/components/proprietary/sso/sign-in-with-sso.tsx`
  - `apps/dokploy/components/dashboard/settings/linking-account/linking-account.tsx`
  - `apps/dokploy/pages/dashboard/settings/profile.tsx`
  - `packages/server/src/lib/auth.ts`
- **修改内容**：
  - 登录页 SSO 不再输入邮箱，按已配置 provider 一键跳转 IdP。
  - Profile「Linking account」支持绑定/解绑 SSO；自托管始终展示该区域。
- **功能与背景**：简化企业 SSO 使用路径。
- **上游侵入评估**：微小 (Low) - `CUSTOM-FEATURE: [SSO One-Click Login/Link]` 锚点。

## [2026-07-22] - 部署绕过 Traefik 逻辑 (ENABLE_TRAEFIK=false)

- **修改文件**：
  - `packages/server/src/utils/docker/domain.ts`
  - `packages/server/src/utils/builders/compose.ts`
- **修改内容**：`ENABLE_TRAEFIK` 关闭时，Compose 部署跳过 Domain 标签注入、`dokploy-network` 挂接、以及连接 `dokploy-traefik` 网络；仍保留 isolation/randomize。
- **功能与背景**：无 Traefik 场景下部署不应因 Domain/service 校验或 Traefik 标签失败（如模板附带的 sslip.io domain）。
- **上游侵入评估**：微小 (Low) - `CUSTOM-FEATURE: [Traefik 解耦]` 锚点。

## [2026-07-22] - Compose Deploy Settings: Restart / Down

- **修改文件**：
  - `packages/server/src/services/compose.ts`
  - `packages/server/src/db/schema/compose.ts`
  - `apps/dokploy/server/api/routers/compose.ts`
  - `apps/dokploy/components/dashboard/compose/general/actions.tsx`
  - `apps/dokploy/components/dashboard/compose/general/compose-down-dialog.tsx`
- **修改内容**：Compose Deploy Settings 新增 **Restart**（重启 compose 全部服务）与 **Down**（`docker compose down`，弹窗可选移除 Volume）。
- **功能与背景**：补充 compose 运维动作，Down 支持按项目 volume 勾选删除，仅允许移除本 compose 关联 volume。
- **上游侵入评估**：微小 (Low) - service/router/UI 以 `CUSTOM-FEATURE: [Compose Restart/Down]` 锚点隔离。

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
