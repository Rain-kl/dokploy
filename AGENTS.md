# AGENTS.md - Dokploy 二次开发与 AI Agent 协作规范

本文件定义了在 Dokploy 项目中进行二次开发（二开）以及 AI Agent 编码协作必须严格遵循的核心原则、开发规范与变更追踪标准。

---

## 🎯 核心原则

### 0. 快速熟悉项目 (Quick Project Familiarization)
* **修改前必读**：进行任何代码修改或二次开发前，**必须先阅读 [`docs/README.md`](file:///Users/ryan/DEV/Node/dokploy/docs/README.md)** 对项目架构、启动流程与代码模块划分进行快速了解。

### 1. 高质量与最简代码 (High Quality & Minimal Code)
* **追求极简与高能**：用最少的代码行数、最清晰的表达实现目标功能。拒绝过度工程化与无谓的封装。
* **参考原生实现**：时刻对齐 Dokploy 当前的编码风格与技术选型（TypeScript, Next.js 16, tRPC v11, Drizzle ORM, Better-Auth, Tailwind CSS, Shadcn UI）。
* **严禁重复造轮子**：
  * 在编写任何新代码前，**必须**先使用 `grep_search` / `list_dir` 检索代码库，检查是否已有现成的组件、工具函数、数据库 Schema 或 Service 逻辑。
  * **前端 UI**：优先复用 `@/components/ui/` (Shadcn/Radix) 已有的 Button, Dialog, Form, Input, Table 等标准组件。
  * **后端逻辑**：优先复用 `@dokploy/server` (`packages/server/src/utils/` 及 `src/services/`) 中现有的 Dockerode 封装、Traefik 配置生成器、命令执行 `execAsync` 及加解密工具。

### 2. 低侵入式二开 (Low-Intrusion Customization)
为了保证二次开发项目后续能无缝同步上游 (Upstream `dokploy/dokploy`) 的最新功能与安全更新，必须采用**低侵入性架构模式**：

* **核心逻辑解耦与目录隔离**：
  * 自定义的扩展业务逻辑、独立 Service、工具库及组件，统一存放在专用的二开隔离目录中（如 `packages/server/src/custom/` 或 `apps/dokploy/custom/`），严禁将自定义新逻辑散落在上游核心代码文件中。
* **非破坏性扩展模式 (Composition & Wrapper)**：
  * **tRPC Router**：新增 API 接口时，通过新建独立的 custom router 并合并至 `appRouter` 中，而不是在原生的 router 文件中掺杂大量新逻辑。
  * **数据库 Schema**：扩展字段或表时，优先新增独立的扩展表（如 `user_custom_profile`）或在二开 Schema 文件中定义，避免直接大范围修改上游原始 Schema 结构。
* **最小化侵入标记 (Minimal Diff Anchors)**：
  * 如果**必须**修改上游现有文件（如在主入口、导航栏或已有 router 中添加挂钩），必须保持修改行数最少，并使用统一的注释锚点包裹：
    ```typescript
    // CUSTOM-FEATURE: [功能名称] START (修改背景: xxx)
    const customResult = await handleCustomLogic();
    // CUSTOM-FEATURE: [功能名称] END
    ```

---

## 📝 变更同步规范 (CHANGELOG.md)

**仅针对具备实质价值的代码二次开发（如新增核心功能、架构调整、破坏性变更或上游合并），才同步更新根目录下的 [`CHANGELOG.md`](file:///Users/ryan/DEV/Node/dokploy/CHANGELOG.md) 文件。**

### 1. 过滤原则与要求
* **严禁记录无价值内容**：如文档更新、注释修饰、格式化微调、极小 BUG 修复等琐碎改动**一律不写** CHANGELOG。
* **语言精炼**：拒绝任何冗长废话与套话，用最少字数准确说明关键信息。

### 2. 记录格式标准
在 `CHANGELOG.md` 中按最新日期增加条目，每条变更包含以下精炼要素：

```markdown
## [YYYY-MM-DD] - [功能名称 / 变更简述]

- **修改文件**：`apps/dokploy/server/api/root.ts`
- **修改内容**：挂载 `customPluginRouter` 路由。
- **功能与背景**：实现企业级第三方 SSO 鉴权扩展，保证与上游主 Router 解耦。
- **上游侵入评估**：微小 (Low) - 仅在 root.ts 挂钩 2 行。
```

---

## 🛠️ 上游合并与冲突处理指南 (Upstream Conflict Resolution)

当上游 Dokploy 发布新版本需要进行 `git pull upstream canary` 或 `git merge` 时，请按以下步骤处理冲突：

### 1. 冲突防范设计
由于二开逻辑大部分位于独立的 `custom/` 目录中，合并冲突将仅局限于**锚点挂钩文件**（如入口 `server.ts`、`root.ts` 等）。

### 2. 标准冲突解决流程
1. **优先保留上游核心逻辑**：遇到冲突时，先 accept upstream 更改，保证上游核心机制、安全补丁与基础依赖正确更新。
2. **重新应用锚点补丁**：根据 `CHANGELOG.md` 中记录的 `CUSTOM-FEATURE` 标记与修改行，检查挂钩点是否存在位置偏移或接口变动，将自定义调用重新挂载至新版入口上。
3. **验证代码一致性**：
   ```bash
   # 检查 TypeScript 类型契约
   pnpm run typecheck

   # 检查 代码规范与 Formatting
   pnpm run format-and-lint

   # 验证构建
   pnpm run dokploy:build
   ```
4. **记录合并事件**：在 `CHANGELOG.md` 中记录本次同步上游版本号（如 `Sync with Upstream v0.9.x`）及冲突修复情况。

### 3. 二开数据库 Migration（禁止占上游序号）
* **主链**：`apps/dokploy/drizzle/` 仅跟随上游，禁止放入二开 SQL。
* **二开链**：DDL 写入 `apps/dokploy/drizzle-custom/`（自有 `_journal.json`，序号从 `0000` 起）。
* **运行**：`migration.ts` 先跑 `drizzle/`，再跑 `drizzle-custom/`（表名 `drizzle_migrations_custom`）。
* **生成**：`pnpm run migration:generate` 若把二开列又生成进主链，**丢弃主链文件**，改为手写 SQL 追加到 `drizzle-custom/`。
* **镜像**：`Dockerfile` / `Dockerfile.cloud` 需 `COPY drizzle-custom`。

---

## 📋 AI Agent 执行 Check List

AI 智能体在为本项目编写或修改代码时，必须按以下步骤自检：

- [ ] **项目熟悉**：修改代码前是否已阅读 [`docs/README.md`](file:///Users/ryan/DEV/Node/dokploy/docs/README.md) 快速了解项目架构与模块？
- [ ] **复用检查**：是否检索过项目已有实现，确保没有重写已有的 utility/component/service？
- [ ] **行数优化**：代码是否精简干净，去除了不必要的类型断言或冗余逻辑？
- [ ] **侵入性检查**：新功能是否优先放在了 `custom/` 隔离目录中？原有文件修改是否有 `CUSTOM-FEATURE` 锚点？
- [ ] **文档记录**：是否已在 `CHANGELOG.md` 中详细写明修改文件、功能、背景与修改内容？
- [ ] **构建校验**：是否运行了 `pnpm run typecheck` 验证无类型报错？
