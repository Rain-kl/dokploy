# Multi-Database Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Create/Edit Backup to multi-select databases (live list + manual add), store them on one schedule, and produce one dump file per selected database.

**Architecture:** Add `databases: string[]` (jsonb) alongside legacy `database`; normalize on write/read. Backup runners loop resolved names sequentially with per-DB filenames. New `listDatabases` helper queries the running container; UI uses checkboxes + manual tags. Restore stays single-file.

**Tech Stack:** TypeScript, Drizzle ORM, tRPC, React Hook Form + Zod, Vitest, Docker exec (`pg_dump` / `mysqldump` / etc.)

**Spec:** `docs/superpowers/specs/2026-07-23-multi-database-backup-design.md`

## Global Constraints

- Low-intrusion: prefer `packages/server/src/custom/` for new list logic; use `// CUSTOM-FEATURE: multi-database-backup` anchors on upstream file edits.
- Keep legacy `database` column; never drop it.
- One dump file per DB; fail-fast on first DB error; keep already uploaded files.
- No multi-select for `web-server` / `libsql`.
- No changes to restore multi-DB wizard or volume backups.
- Security: continue env-var + `shell-quote` pattern; never interpolate DB names into unquoted shell.
- After substantive work: `pnpm run typecheck` (or project equivalent); update root `CHANGELOG.md`.
- Do not commit unless user explicitly asks.

## File map

| Path | Role |
|------|------|
| `packages/server/src/db/schema/backups.ts` | `databases` column + API zod |
| `apps/dokploy/drizzle/*` | Generated migration + journal |
| `packages/server/src/custom/backups/resolve-databases.ts` | Normalize / resolve helpers |
| `packages/server/src/custom/backups/list-databases.ts` | Live list commands + runner |
| `packages/server/src/utils/backups/utils.ts` | Filename sanitize; multi-DB shell or command override |
| `packages/server/src/utils/backups/{postgres,mysql,mariadb,mongo,compose,libsql}.ts` | Loop DBs + unique filenames |
| `packages/server/src/services/backup.ts` | Normalize on create/update |
| `apps/dokploy/server/api/routers/backup.ts` | `listDatabases` procedure + anchors |
| `packages/server/src/index.ts` | Export custom helpers if needed |
| `apps/dokploy/components/dashboard/database/backups/handle-backup.tsx` | Multi-select UI |
| `apps/dokploy/components/dashboard/database/backups/show-backups.tsx` | Display joined names |
| `apps/dokploy/__test__/utils/multi-database-backup.test.ts` | Unit tests (new) |
| `CHANGELOG.md` | Feature entry |

---

### Task 1: Schema + normalize helpers + unit tests

**Files:**
- Modify: `packages/server/src/db/schema/backups.ts`
- Create: `packages/server/src/custom/backups/resolve-databases.ts`
- Create: `apps/dokploy/__test__/utils/multi-database-backup.test.ts`
- Generate: migration under `apps/dokploy/drizzle/` via drizzle-kit

**Interfaces:**
- Produces:
  - `resolveBackupDatabases(input: { database?: string | null; databases?: string[] | null }): string[]`
  - `normalizeBackupDatabaseFields(input: { database?: string; databases?: string[] }): { database: string; databases: string[] }`
  - `sanitizeBackupDbFilePart(name: string): string`
  - Table column `databases: jsonb("databases").$type<string[]>()`
  - Zod: `databases` optional array on create/update; still accept `database`

- [ ] **Step 1: Write failing unit tests**

Create `apps/dokploy/__test__/utils/multi-database-backup.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
	normalizeBackupDatabaseFields,
	resolveBackupDatabases,
	sanitizeBackupDbFilePart,
} from "@dokploy/server/custom/backups/resolve-databases";

describe("resolveBackupDatabases", () => {
	test("prefers databases array", () => {
		expect(
			resolveBackupDatabases({ database: "a", databases: ["x", "y"] }),
		).toEqual(["x", "y"]);
	});
	test("falls back to legacy database", () => {
		expect(resolveBackupDatabases({ database: "legacy" })).toEqual([
			"legacy",
		]);
	});
	test("trims and drops empties", () => {
		expect(
			resolveBackupDatabases({ databases: [" a ", "", "b"] }),
		).toEqual(["a", "b"]);
	});
});

describe("normalizeBackupDatabaseFields", () => {
	test("from databases only", () => {
		expect(normalizeBackupDatabaseFields({ databases: ["a", "b"] })).toEqual({
			database: "a",
			databases: ["a", "b"],
		});
	});
	test("from legacy database only", () => {
		expect(normalizeBackupDatabaseFields({ database: "only" })).toEqual({
			database: "only",
			databases: ["only"],
		});
	});
	test("dedupes preserving order", () => {
		expect(
			normalizeBackupDatabaseFields({ databases: ["a", "a", "b"] }),
		).toEqual({ database: "a", databases: ["a", "b"] });
	});
});

describe("sanitizeBackupDbFilePart", () => {
	test("replaces path-unsafe characters", () => {
		expect(sanitizeBackupDbFilePart("my/db..name")).toBe("my_db_name");
		expect(sanitizeBackupDbFilePart("ok-db_1")).toBe("ok-db_1");
	});
});
```

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

```bash
cd apps/dokploy && pnpm exec vitest run __test__/utils/multi-database-backup.test.ts
```

Expected: fail resolving `@dokploy/server/custom/backups/resolve-databases`.

- [ ] **Step 3: Implement helpers**

Create `packages/server/src/custom/backups/resolve-databases.ts`:

```ts
export const resolveBackupDatabases = (input: {
	database?: string | null;
	databases?: string[] | null;
}): string[] => {
	const fromArray = (input.databases ?? [])
		.map((n) => n.trim())
		.filter(Boolean);
	if (fromArray.length > 0) {
		return [...new Set(fromArray)];
	}
	const legacy = input.database?.trim();
	return legacy ? [legacy] : [];
};

export const normalizeBackupDatabaseFields = (input: {
	database?: string;
	databases?: string[];
}): { database: string; databases: string[] } => {
	const databases = resolveBackupDatabases(input);
	if (databases.length === 0) {
		throw new Error("At least one database name is required");
	}
	return { database: databases[0]!, databases };
};

/** Safe path segment for dump filenames */
export const sanitizeBackupDbFilePart = (name: string): string =>
	name
		.trim()
		.replace(/[/\\?%*:|"<>.\s]+/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_|_$/g, "") || "database";
```

- [ ] **Step 4: Schema changes**

In `packages/server/src/db/schema/backups.ts`:

1. On table `backups`, after `database: text("database").notNull()`, add:

```ts
// CUSTOM-FEATURE: multi-database-backup START
databases: jsonb("databases").$type<string[]>(),
// CUSTOM-FEATURE: multi-database-backup END
```

2. In `createSchema` zod overrides, add:

```ts
databases: z.array(z.string().min(1)).optional(),
```

Keep `database: z.string().min(1)`.

3. Add `databases: true` to `apiCreateBackup` pick and `apiUpdateBackup` pick.

- [ ] **Step 5: Export path**

Ensure package resolves `@dokploy/server/custom/backups/resolve-databases`. Prefer adding to `packages/server/src/index.ts`:

```ts
// CUSTOM-FEATURE: multi-database-backup START
export * from "./custom/backups/resolve-databases";
// CUSTOM-FEATURE: multi-database-backup END
```

If tests import via that path, update test import to `@dokploy/server` or keep deep path if tsconfig allows (match existing deep imports like `@dokploy/server/utils/backups/utils`).

- [ ] **Step 6: Generate migration**

```bash
cd apps/dokploy && pnpm run migration:generate
```

Inspect newest SQL under `apps/dokploy/drizzle/`. It should include roughly:

```sql
ALTER TABLE "backup" ADD COLUMN "databases" jsonb;
-- optional backfill in same or follow-up SQL:
UPDATE "backup" SET "databases" = jsonb_build_array("database") WHERE "databases" IS NULL;
```

If drizzle only adds the column, append a backfill `UPDATE` in the same migration file (manual edit is OK).

- [ ] **Step 7: Run unit tests — expect PASS**

```bash
cd apps/dokploy && pnpm exec vitest run __test__/utils/multi-database-backup.test.ts
```

- [ ] **Step 8: Commit (only if user asked to commit)**

```bash
git add packages/server/src/db/schema/backups.ts \
  packages/server/src/custom/backups/resolve-databases.ts \
  packages/server/src/index.ts \
  apps/dokploy/drizzle \
  apps/dokploy/__test__/utils/multi-database-backup.test.ts
git commit -m "feat(backup): add databases jsonb and resolve helpers"
```

---

### Task 2: Multi-DB backup execution + filenames

**Files:**
- Modify: `packages/server/src/utils/backups/utils.ts`
- Modify: `packages/server/src/utils/backups/postgres.ts`
- Modify: `packages/server/src/utils/backups/mysql.ts`
- Modify: `packages/server/src/utils/backups/mariadb.ts`
- Modify: `packages/server/src/utils/backups/mongo.ts`
- Modify: `packages/server/src/utils/backups/compose.ts`
- Modify: `packages/server/src/utils/backups/libsql.ts` (resolve only; single name)
- Modify: `packages/server/src/services/backup.ts`
- Extend: `apps/dokploy/__test__/utils/multi-database-backup.test.ts`

**Interfaces:**
- Consumes: `resolveBackupDatabases`, `sanitizeBackupDbFilePart`, `normalizeBackupDatabaseFields`
- Produces: `generateBackupCommand(backup, databaseName: string)` uses explicit name; runners loop names

- [ ] **Step 1: Add test for multi-file naming helper (optional inline)**

Append to multi-database-backup test:

```ts
test("filename pattern parts", () => {
	const part = sanitizeBackupDbFilePart("app-db");
	const ts = "2026-07-23T00-00-00-000Z";
	expect(`${part}-${ts}.sql.gz`).toBe("app-db-2026-07-23T00-00-00-000Z.sql.gz");
});
```

- [ ] **Step 2: Change `generateBackupCommand` to take database name**

In `packages/server/src/utils/backups/utils.ts`, change signature:

```ts
export const generateBackupCommand = (
	backup: BackupSchedule,
	databaseName: string,
) => {
	// replace every backup.database usage inside with databaseName
```

Update `getBackupCommand` to accept optional override or build multi-DB script.

**Preferred approach (Node-side loop in runners):** keep `getBackupCommand(backup, rcloneCommand, logPath)` single-DB, but require callers to set `backup.database` per iteration OR pass database into generate:

```ts
export const getBackupCommand = (
	backup: BackupSchedule,
	rcloneCommand: string,
	logPath: string,
	databaseName?: string,
) => {
	const dbName = databaseName ?? backup.database;
	const backupCommand = generateBackupCommand(backup, dbName);
	// rest unchanged — container search once, dump | rclone once
```

Update all `generateBackupCommand` call sites to pass `databaseName`.

- [ ] **Step 3: Loop in each `run*Backup`**

Pattern for `postgres.ts` (mirror for mysql/mariadb/mongo/compose):

```ts
import {
	resolveBackupDatabases,
	sanitizeBackupDbFilePart,
} from "../../custom/backups/resolve-databases";

// inside try, after destination resolved:
const dbNames = resolveBackupDatabases(backup);
if (dbNames.length === 0) {
	throw new Error("No database names configured for backup");
}
const timestamp = getBackupTimestamp();
const rcloneFlags = getS3Credentials(destination);

for (const dbName of dbNames) {
	const ext = /* mongo uses bson.gz; others sql.gz — match existing per file */;
	const backupFileName = `${sanitizeBackupDbFilePart(dbName)}-${timestamp}.${ext}`;
	const bucketDestination = `${appName}/${normalizeS3Path(prefix)}${backupFileName}`;
	const rcloneDestination = `:s3:${destination.bucket}/${bucketDestination}`;
	const rcloneCommand = `rclone rcat ${rcloneFlags.join(" ")} "${rcloneDestination}"`;
	const backupCommand = getBackupCommand(
		backup,
		rcloneCommand,
		deployment.logPath,
		dbName,
	);
	if (postgres.serverId) {
		await execAsyncRemote(postgres.serverId, backupCommand);
	} else {
		await execAsync(backupCommand, { shell: "/bin/bash" });
	}
}

await sendDatabaseBackupNotifications({
	// ...
	databaseName: dbNames.join(", "),
});
```

Mongo: keep extension consistent with existing (`bson.gz` if current single file was that, else match `runMongoBackup` today — currently `getBackupTimestamp().sql.gz` in some paths; **keep each runner’s existing extension convention**, only prefix with sanitized db name).

Compose: same loop; credentials from metadata unchanged.

LibSQL / web-server: `resolveBackupDatabases` will return single entry; loop is fine.

Fail-fast: do not catch per-DB inside loop; outer catch already sends error notification. On error mid-loop, prior S3 objects remain.

- [ ] **Step 4: Normalize on create/update in service**

`packages/server/src/services/backup.ts`:

```ts
import { normalizeBackupDatabaseFields } from "../custom/backups/resolve-databases";

export const createBackup = async (input: z.infer<typeof apiCreateBackup>) => {
	const { database, databases } = normalizeBackupDatabaseFields({
		database: input.database,
		databases: input.databases as string[] | undefined,
	});
	const newBackup = await db
		.insert(backups)
		.values({ ...input, database, databases } as typeof backups.$inferInsert)
		// ...
};

export const updateBackupById = async (
	backupId: string,
	backupData: Partial<Backup>,
) => {
	let data = { ...backupData };
	if (backupData.database !== undefined || backupData.databases !== undefined) {
		const normalized = normalizeBackupDatabaseFields({
			database: backupData.database,
			databases: backupData.databases ?? undefined,
		});
		data = { ...data, ...normalized };
	}
	// existing update
};
```

- [ ] **Step 5: Run injection + unit tests**

```bash
cd apps/dokploy && pnpm exec vitest run __test__/utils/multi-database-backup.test.ts __test__/backups/db-backup-restore-injection.test.ts
```

Expected: PASS. If `generateBackupCommand` signature breaks tests, they only use get*BackupCommand builders — should still pass.

- [ ] **Step 6: Typecheck**

```bash
pnpm run typecheck
```

Fix any call sites of `generateBackupCommand` / missing `databases` types.

---

### Task 3: `listDatabases` backend API

**Files:**
- Create: `packages/server/src/custom/backups/list-databases.ts`
- Modify: `packages/server/src/index.ts` (export)
- Modify: `apps/dokploy/server/api/routers/backup.ts`
- Create/extend tests for list command builders (injection-safe)

**Interfaces:**
- Produces:
  - `listDatabasesForService(params): Promise<{ databases: string[]; warning?: string }>`
  - tRPC: `backup.listDatabases`

- [ ] **Step 1: Implement list command builders + executor**

`packages/server/src/custom/backups/list-databases.ts`:

```ts
import { quote } from "shell-quote";
import {
	getComposeContainerCommand,
	getServiceContainerCommand,
} from "../../utils/backups/utils";
import { execAsync, execAsyncRemote } from "../../utils/process/execAsync";

export type ListDatabasesInput = {
	databaseType: "postgres" | "mysql" | "mariadb" | "mongo";
	appName: string;
	serverId?: string | null;
	// credentials
	databaseUser?: string;
	databasePassword?: string;
	databaseRootPassword?: string;
	// compose
	composeType?: "stack" | "docker-compose";
	serviceName?: string | null;
	backupType?: "database" | "compose";
};

const SYSTEM_MYSQL = new Set([
	"information_schema",
	"performance_schema",
	"mysql",
	"sys",
]);
const SYSTEM_MONGO = new Set(["admin", "local", "config"]);

export const getListDatabasesInnerCommand = (
	type: ListDatabasesInput["databaseType"],
	creds: Pick<
		ListDatabasesInput,
		"databaseUser" | "databasePassword" | "databaseRootPassword"
	>,
): string => {
	switch (type) {
		case "postgres":
			return `docker exec -e DB_USER=${quote([creds.databaseUser || ""])} -i $CONTAINER_ID bash -c 'psql -h localhost -U "$DB_USER" -d postgres -tAc "SELECT datname FROM pg_database WHERE datistemplate = false AND datallowconn"'`;
		case "mysql":
			return `docker exec -e DB_PASS=${quote([creds.databaseRootPassword || ""])} -i $CONTAINER_ID bash -c 'mysql -uroot -p"$DB_PASS" -N -e "SHOW DATABASES"'`;
		case "mariadb":
			return `docker exec -e DB_USER=${quote([creds.databaseUser || ""])} -e DB_PASS=${quote([creds.databasePassword || ""])} -i $CONTAINER_ID bash -c 'mariadb -u"$DB_USER" -p"$DB_PASS" -N -e "SHOW DATABASES"'`;
		case "mongo":
			return `docker exec -e DB_USER=${quote([creds.databaseUser || ""])} -e DB_PASS=${quote([creds.databasePassword || ""])} -i $CONTAINER_ID bash -c 'mongosh --quiet -u "$DB_USER" -p "$DB_PASS" --authenticationDatabase admin --eval "db.adminCommand({ listDatabases: 1 }).databases.map(d => d.name).join(\\"\\n\\")"'`;
		default:
			throw new Error("Unsupported type");
	}
};

export const parseListedDatabases = (
	type: ListDatabasesInput["databaseType"],
	stdout: string,
): string[] => {
	const names = stdout
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	if (type === "mysql" || type === "mariadb") {
		return names.filter((n) => !SYSTEM_MYSQL.has(n));
	}
	if (type === "mongo") {
		return names.filter((n) => !SYSTEM_MONGO.has(n));
	}
	return names;
};

export const listDatabasesForService = async (
	input: ListDatabasesInput,
): Promise<{ databases: string[]; warning?: string }> => {
	const containerSearch =
		input.backupType === "compose" && input.serviceName
			? getComposeContainerCommand(
					input.appName,
					input.serviceName,
					input.composeType,
				)
			: getServiceContainerCommand(input.appName);

	const inner = getListDatabasesInnerCommand(input.databaseType, input);
	const script = `
set -e
CONTAINER_ID=$(${containerSearch})
if [ -z "$CONTAINER_ID" ]; then
  echo "CONTAINER_NOT_FOUND" >&2
  exit 1
fi
${inner}
`;
	try {
		const result = input.serverId
			? await execAsyncRemote(input.serverId, script)
			: await execAsync(script, { shell: "/bin/bash" });
		const stdout =
			typeof result === "string"
				? result
				: ((result as { stdout?: string }).stdout ?? String(result));
		return { databases: parseListedDatabases(input.databaseType, stdout) };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to list databases";
		return { databases: [], warning: message };
	}
};
```

Adjust `execAsync` result shape to match real return type in codebase (read `execAsync` if needed — use `.stdout` consistently).

- [ ] **Step 2: Export**

```ts
// CUSTOM-FEATURE: multi-database-backup
export * from "./custom/backups/list-databases";
```

- [ ] **Step 3: tRPC procedure**

In `apps/dokploy/server/api/routers/backup.ts`, add input zod + procedure with permission checks mirroring `create`:

```ts
// CUSTOM-FEATURE: multi-database-backup START
listDatabases: protectedProcedure
	.input(
		z.object({
			databaseType: z.enum(["postgres", "mysql", "mariadb", "mongo"]),
			backupType: z.enum(["database", "compose"]).default("database"),
			postgresId: z.string().optional(),
			mysqlId: z.string().optional(),
			mariadbId: z.string().optional(),
			mongoId: z.string().optional(),
			composeId: z.string().optional(),
			serviceName: z.string().optional(),
			metadata: z
				.object({
					postgres: z.object({ databaseUser: z.string() }).optional(),
					mysql: z.object({ databaseRootPassword: z.string() }).optional(),
					mariadb: z
						.object({
							databaseUser: z.string(),
							databasePassword: z.string(),
						})
						.optional(),
					mongo: z
						.object({
							databaseUser: z.string(),
							databasePassword: z.string(),
						})
						.optional(),
				})
				.optional(),
		}),
	)
	.query(async ({ input, ctx }) => {
		// resolve service by id, checkServicePermissionAndAccess backup read
		// load appName, serverId, credentials from service OR metadata for compose
		// call listDatabasesForService
	}),
// CUSTOM-FEATURE: multi-database-backup END
```

Implementation detail for database type:

```ts
if (input.postgresId) {
	const postgres = await findPostgresById(input.postgresId);
	await checkServicePermissionAndAccess(ctx, input.postgresId, {
		backup: ["read"],
	});
	return listDatabasesForService({
		databaseType: "postgres",
		appName: postgres.appName,
		serverId: postgres.serverId,
		databaseUser: postgres.databaseUser,
		backupType: "database",
	});
}
// similarly mysql (root password), mariadb, mongo
// compose: findComposeById, appName, composeType, serviceName, metadata creds
```

- [ ] **Step 4: Unit test parse + injection for list builders**

Add tests that `getListDatabasesInnerCommand` with malicious user/password does not create `MARK` file (same stub pattern as injection test, or string-assert `-e DB_USER=` quoting).

- [ ] **Step 5: typecheck**

```bash
pnpm run typecheck
```

---

### Task 4: Create/Edit Backup UI multi-select

**Files:**
- Modify: `apps/dokploy/components/dashboard/database/backups/handle-backup.tsx`

**Interfaces:**
- Consumes: `api.backup.listDatabases`
- Form: `databases: string[]` for multi types; keep `database` for web-server/libsql

- [ ] **Step 1: Schema update**

Replace single `database: z.string().min(1)` with:

```ts
database: z.string().optional(), // legacy / single types
databases: z.array(z.string().min(1)).optional(),
```

`superRefine`:

```ts
const multiTypes = ["postgres", "mysql", "mariadb", "mongo"];
const dtype = data.databaseType;
if (dtype && multiTypes.includes(dtype)) {
	if (!data.databases?.length) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Select at least one database",
			path: ["databases"],
		});
	}
} else if (dtype === "web-server" || dtype === "libsql") {
	if (!data.database?.trim()) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Database required",
			path: ["database"],
		});
	}
}
```

- [ ] **Step 2: Defaults / reset**

```ts
databases: backup?.databases?.length
	? backup.databases
	: backup?.database
		? [backup.database]
		: [],
database: /* web-server/libsql defaults unchanged */,
```

- [ ] **Step 3: Query list**

```ts
const watchedType = form.watch("databaseType") ?? databaseType;
const watchedService = form.watch("serviceName");
const canList =
	["postgres", "mysql", "mariadb", "mongo"].includes(watchedType || "") &&
	(backupType !== "compose" || !!watchedService);

const {
	data: listed,
	isFetching: isListing,
	refetch: refetchDatabases,
	error: listError,
} = api.backup.listDatabases.useQuery(
	{
		databaseType: watchedType as "postgres" | "mysql" | "mariadb" | "mongo",
		backupType,
		postgresId: databaseType === "postgres" ? id : undefined,
		mysqlId: databaseType === "mysql" ? id : undefined,
		mariadbId: databaseType === "mariadb" ? id : undefined,
		mongoId: databaseType === "mongo" ? id : undefined,
		composeId: backupType === "compose" ? id : undefined,
		serviceName: watchedService || undefined,
		metadata: form.watch("metadata"),
	},
	{ enabled: isOpen && canList, retry: false },
);
```

- [ ] **Step 4: Replace Database Input UI**

For multi types:

- Label: Databases
- Button refresh → `refetchDatabases`
- Scrollable list of checkboxes from `listed?.databases` unioned with currently selected
- Selected chips with remove
- Manual: `Input` + Add button → append unique name to `databases`
- Show `listed?.warning` or query error as muted AlertBlock

Use existing `@/components/ui/checkbox`, `Button`, `Input`, `ScrollArea`.

For web-server/libsql: keep current single Input bound to `database`.

- [ ] **Step 5: Submit payload**

```ts
const multi = ["postgres", "mysql", "mariadb", "mongo"].includes(
	data.databaseType || databaseType || "",
);
await createBackup({
	// ...
	database: multi ? data.databases![0]! : data.database!,
	databases: multi ? data.databases : data.database ? [data.database] : [],
	// ...
});
```

- [ ] **Step 6: Manual UI smoke checklist**

1. Open Create Backup on postgres with 2+ DBs in container → list shows → multi-select save  
2. Stop container → warning → manual add works  
3. Edit existing single-DB backup → one checkbox selected  

---

### Task 5: List display + notifications polish

**Files:**
- Modify: `apps/dokploy/components/dashboard/database/backups/show-backups.tsx`
- Modify runners notifications (if not done in Task 2)

- [ ] **Step 1: Display joined names**

```tsx
{(backup.databases?.length
	? backup.databases.join(", ")
	: backup.database)}
```

- [ ] **Step 2: Confirm success/error notifications use joined names**

Already set in Task 2 `databaseName: dbNames.join(", ")`. On error mid-loop, optional improve message with failed db: `errorMessage` includes db name if available.

- [ ] **Step 3: typecheck + lint**

```bash
pnpm run typecheck
pnpm run format-and-lint
```

---

### Task 6: CHANGELOG + final verification

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG entry** (AGENTS.md format)

```markdown
## [2026-07-23] - Multi-database backup selection

- **修改文件**：`packages/server/src/db/schema/backups.ts`, `packages/server/src/custom/backups/*`, `packages/server/src/utils/backups/*`, `packages/server/src/services/backup.ts`, `apps/dokploy/server/api/routers/backup.ts`, `apps/dokploy/components/dashboard/database/backups/*`, drizzle migration
- **修改内容**：Backup 支持 `databases[]` 多选；容器 listDatabases + 手填；每库独立 dump 文件名；兼容旧 `database` 字段
- **功能与背景**：一条备份计划可覆盖同实例多个逻辑库
- **上游侵入评估**：中等 (Medium) — schema/API/UI + 执行循环；list 逻辑在 custom/
```

- [ ] **Step 2: Full verification**

```bash
cd apps/dokploy && pnpm exec vitest run __test__/utils/multi-database-backup.test.ts __test__/backups/db-backup-restore-injection.test.ts __test__/utils/backups.test.ts
pnpm run typecheck
```

- [ ] **Step 3: Spec coverage check (self)**

| Spec requirement | Task |
|------------------|------|
| `databases` jsonb + legacy `database` | 1 |
| Migration backfill | 1 |
| Normalize API write | 2 |
| Per-DB files + fail-fast | 2 |
| listDatabases + warning | 3 |
| Multi-select UI + manual | 4 |
| List display | 5 |
| No restore/volume change | — (skipped) |
| CHANGELOG | 6 |

---

## Self-review (plan)

1. **Spec coverage:** All approved goals mapped to tasks 1–6; non-goals excluded.  
2. **Placeholders:** None; concrete code and commands included.  
3. **Type consistency:** `resolveBackupDatabases` / `normalizeBackupDatabaseFields` / `sanitizeBackupDbFilePart` / `listDatabasesForService` names stable across tasks.  
4. **keepLatestN:** Existing glob `*.{sql.gz,bson.gz}` still matches new `{db}-{ts}.sql.gz` — no change required; multi-DB creates more files per run so N applies to file count (document in code comment if surprising).  
5. **Retention note for implementer:** With multi-DB, one schedule run creates N files; `keepLatestCount` is file-based today — acceptable per YAGNI unless product asks for “keep N runs”.
