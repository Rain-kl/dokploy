# Multi-Database Backup Design

**Date:** 2026-07-23  
**Status:** Approved for implementation planning  
**Feature:** Create Backup 支持多选数据库；每库独立 dump 文件

---

## 1. Problem

Dokploy database backups require a single free-text `database` name. One backup schedule can only target one logical database. Users with multiple databases on the same instance must create N schedules.

## 2. Goals

- List databases from the running container when possible.
- Allow multi-select when creating/editing a backup.
- Allow manual entry when list fails or is empty (container down, etc.).
- One backup config stores multiple database names.
- One run produces **one dump file per selected database**.
- Keep restore flow single-file / single-target (unchanged).
- Low-intrusion customization for upstream merge (CUSTOM-FEATURE anchors / custom modules where practical).

## 3. Non-Goals

- Single dump file containing all databases (`pg_dumpall` / `--all-databases` as one archive).
- Multi-database restore wizard.
- Volume backup changes.
- Multi-select for `web-server` and `libsql` (remain single-database).

## 4. Decisions (user-approved)

| Topic | Choice |
|-------|--------|
| Artifact layout | One file per database |
| DB list source | Live container query + manual fallback |
| Storage model | One schedule row with multiple names |
| Schema approach | New `databases` JSON array + keep legacy `database` for compatibility |

## 5. Data Model

### 5.1 Schema (`packages/server/src/db/schema/backups.ts`)

| Field | Type | Notes |
|-------|------|--------|
| `databases` | `jsonb` → `string[]` | New. Min length 1 when multi-db types. |
| `database` | `text` (existing) | Kept. Write-through: set to first selected name (or joined display if needed for legacy readers). Read path: if `databases` empty/null, treat as `[database]`. |

### 5.2 API contracts

- **Create / Update** accept `databases: string[]` (preferred).
- If only legacy `database: string` is sent, normalize to `databases: [database]`.
- Always persist both: `databases = unique non-empty names`, `database = databases[0]`.
- Validation: at least one name; each name non-empty trimmed string.

### 5.3 Migration

- Add `databases` column (jsonb, nullable or default `[]`).
- Backfill: `UPDATE backup SET databases = jsonb_build_array("database") WHERE databases IS NULL OR databases = '[]'`.
- No drop of `database` column.

### 5.4 Display

- Backup list: show `databases.join(", ")` (fallback to `database`).

## 6. Backup Execution

### 6.1 Resolve list

```ts
const names = (backup.databases?.length ? backup.databases : [backup.database])
  .map((n) => n.trim())
  .filter(Boolean);
```

### 6.2 Per-database dump

Reuse existing command builders:

- Postgres: `pg_dump ... "$DB_NAME" | gzip`
- MySQL: `mysqldump ... "$DB_NAME" | gzip`
- MariaDB: `mariadb-dump --databases "$DB_NAME" | gzip`
- Mongo: `mongodump -d "$DB_NAME" ... --archive --gzip`
- LibSQL / web-server: unchanged single-target (no multi loop UI)

### 6.3 File naming

Current pattern is effectively `{timestamp}.sql.gz`, which **collides** if multiple DBs run in one job.

**New pattern:**

- SQL-like: `{databaseName}-{timestamp}.sql.gz`
- Mongo: `{databaseName}-{timestamp}.bson.gz` (or keep existing extension convention used by `mongodump` pipeline)

Sanitize `databaseName` for path safety (replace path separators / unsafe chars).

Upload path remains: `{appName}/{prefix}{fileName}` via rclone.

### 6.4 Run semantics

1. Resolve container once (or per DB if needed).
2. For each name **sequentially**: dump → stream/upload to destination.
3. On first failure: mark deployment/task `error`, keep already-uploaded files, include failed DB name in notification.
4. Optional: continue remaining DBs after failure (default: **fail-fast after marking error**, but keep prior successes). Spec choice: **fail-fast** (stop loop on first error) for simpler logs; prior files retained.

### 6.5 Keep latest N

`keepLatestCount` continues to apply per destination prefix path as today. With multi-file naming, retention should still operate on the backup file set for that schedule (existing list filter by type extension). Implementation must not delete unrelated schedules' files. If current logic is prefix+glob based, verify multi-file still matches `*.{sql.gz,bson.gz}`.

### 6.6 Notifications

Include selected databases (joined) or specifically failed database name on error. Prefer listing all targeted names on success when count is small.

## 7. List Databases API

### 7.1 Endpoint

tRPC procedure e.g. `backup.listDatabases` (or per-service router if cleaner):

**Input:**

- `databaseType`: postgres | mysql | mariadb | mongo
- Service id (`postgresId` | `mysqlId` | …) **or** compose: `composeId` + `serviceName` + credentials metadata
- Optional compose credentials same as backup metadata

**Output:**

```ts
{ databases: string[]; warning?: string }
```

Empty `databases` + `warning` when container offline / command failed (UI enables manual entry).

### 7.2 Commands (inside running container)

| Type | Approach |
|------|----------|
| Postgres | `psql -U $USER -d postgres -tAc "SELECT datname FROM pg_database WHERE datistemplate = false AND datallowconn"` |
| MySQL | `mysql -uroot -p$PASS -N -e "SHOW DATABASES"` filter system DBs |
| MariaDB | same idea with `mariadb` client |
| Mongo | `mongosh`/`mongo` eval listDatabases; exclude `admin`/`local`/`config` by default (still allow manual add) |

System DBs filtered by default for MySQL/MariaDB: `information_schema`, `performance_schema`, `mysql`, `sys`.

Security: reuse env-var + `shell-quote` pattern from existing dump commands; no raw interpolation of user strings into shell.

### 7.3 Placement (low intrusion)

- Prefer `packages/server/src/custom/backups/list-databases.ts` (or adjacent custom module).
- Hook procedure into backup router with `// CUSTOM-FEATURE: multi-database-backup` anchors if editing upstream router file.
- Reuse `getServiceContainerCommand` / compose container resolution.

## 8. UI

### 8.1 Create / Edit (`handle-backup.tsx`)

For `postgres` | `mysql` | `mariadb` | `mongo` (database + compose backup types):

- Replace single `Input` for Database with:
  - Refreshable multi-select (checkbox list + search) populated by `listDatabases`.
  - Manual add: text field + “Add” → append to selected list if not present.
  - Selected chips / tags removable.
- Validation: `databases: z.array(z.string().min(1)).min(1)`.
- `web-server` / `libsql`: keep single field / disabled multi-select as today.

### 8.2 List view (`show-backups.tsx`)

Show `databases?.join(", ") ?? database`.

### 8.3 Restore

Unchanged: pick one backup file, enter one target `databaseName`.

## 9. Compatibility

| Scenario | Behavior |
|----------|----------|
| Old rows | `databases` null → runtime `[database]` |
| Old API clients | Only send `database` → server normalizes |
| Old single-file names | Restore still works by file path; no rename of historical files |
| Upstream merge | Schema + UI + list helper; minimal anchors in root/router |

## 10. Testing

- Unit: normalize `database` / `databases`; filename sanitization; command builders still receive one DB per call.
- Injection tests: extend existing `db-backup-restore-injection` patterns for multi names and list commands.
- Manual: multi-select two DBs → two objects in S3; container stopped → manual add still creates schedule; restore one file.

## 11. CHANGELOG (when implemented)

Record per project AGENTS.md: files touched, multi-select behavior, invasion level (schema + backup utils + UI; list helper in custom if possible).

## 12. Implementation order (preview)

1. Schema + migration + API zod normalize  
2. Execution loop + filename  
3. `listDatabases` backend  
4. UI multi-select + manual add  
5. List display + notifications  
6. Tests + typecheck + CHANGELOG  

---

## Spec self-review

- No TBD placeholders left for required decisions.
- Artifact = per-DB files; storage = JSON array + legacy field; list = query + manual — consistent.
- Scope excludes all-in-one dump and multi restore.
- Fail-fast on first DB error, keep prior uploads — explicit.
