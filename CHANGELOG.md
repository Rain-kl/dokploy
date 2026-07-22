# CHANGELOG.md - Dokploy 二次开发变更日志

仅记录具备实质价值的代码二次开发（核心功能、架构调整、合并冲突等）。

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
