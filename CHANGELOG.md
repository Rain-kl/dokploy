# CHANGELOG.md - Dokploy 二次开发变更日志

仅记录具备实质价值的代码二次开发（核心功能、架构调整、合并冲突等）。

---

## [2026-07-22] - 调整基础设施 Postgres 与 Redis 容器镜像为 Alpine / Valkey

- **修改文件**：
  - `packages/server/src/setup/postgres-setup.ts`
  - `packages/server/src/setup/redis-setup.ts`
  - `packages/server/src/db/schema/postgres.ts`
  - `packages/server/src/db/schema/redis.ts`
  - `script/install.sh`
- **修改内容**：将 PostgreSQL 镜像统一切换为 `postgres:16-alpine`；将 Redis 镜像统一切换为开源轻量的 `valkey/valkey:8-alpine`。
- **功能与背景**：大幅精简 Docker 基础设施镜像体积与系统资源开销，提供更高效安全的运行时环境。
- **上游侵入评估**：极小 (Low)。

---

## [2026-07-22] - 二开独立安装脚本与镜像源定制

- **修改文件**：
  - `script/install.sh`
  - `apps/dokploy/docker/build.sh`
  - `apps/dokploy/docker/push.sh`
  - `apps/dokploy/server/api/routers/settings.ts`
- **修改内容**：在本地 `script/install.sh` 创建专属安装脚本，并将 Docker 镜像源切至 `Rain-kl/dokploy` (`ghcr.io/rain-kl/dokploy`)。
- **功能与背景**：实现二次开发仓库独立安装与镜像升级，脱离 Dokploy 官方源绑定。
- **上游侵入评估**：极小 (Low)。

---

## [2026-07-22] - 移除企业版 License 远程校验，企业功能全开

- **修改文件**：
  - `packages/server/src/services/proprietary/license-key.ts`
  - `packages/server/src/utils/crons/enterprise.ts`
  - `apps/dokploy/server/utils/enterprise.ts`
  - `packages/server/src/lib/auth.ts`
  - `apps/dokploy/server/api/routers/proprietary/sso.ts`
  - `apps/dokploy/server/api/routers/proprietary/license-key.ts`
- **修改内容**：`hasValidLicense` 恒返回 true；禁用 3 天一次的 `licenses-api.dokploy.com` 远程校验定时任务；activate/validate/deactivate 本地化 no-op；移除 SCIM/SSO 对 License 的依赖。
- **功能与背景**：自托管场景下企业功能（SSO、SCIM、自定义角色、审计日志、白标等）无需官方 License 即可使用，不再向官方验证节点上报 `{ licenseKey, ip }`。
- **上游侵入评估**：微小 (Low) - 以 `CUSTOM-FEATURE: [Unlock Enterprise]` 锚点隔离，核心门闩集中在 `hasValidLicense`。

---

## [2026-07-22] - 解耦并移除 Traefik 强制反向代理依赖

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
- **修改内容**：新增 `ENABLE_TRAEFIK` 控制开关（默认 `false`），彻底跳过 `dokploy-traefik` 容器拉起与动态 YAML 生成，并在前端页面中动态隐藏 Domains 标签页及 Traefik 高级设置组件。
- **功能与背景**：实现 Dokploy 与 Traefik 的反向代理强依赖解耦，界面上不再展示多余的 Domains 反代配置项，支持直接暴露宿主机端口。
- **上游侵入评估**：极小 (Low) - 采用 `ENABLE_TRAEFIK` 条件判断与注释锚点隔离，无破坏性修改。

---

## [2026-07-22] - 初始化二次开发与 AI 协作规范

- **修改文件**：`AGENTS.md`
- **修改内容**：制定二次开发规范与 AI Agent 协作约束。
- **功能与背景**：确立低侵入式二开架构、最简代码原则、上游合并冲突处理及 CHANGELOG 过滤标准。
- **上游侵入评估**：零侵入 (Zero Impact)。
