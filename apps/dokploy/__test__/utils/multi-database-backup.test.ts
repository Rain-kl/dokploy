import {
	extractBackupRunId,
	selectBackupFilesToDelete,
} from "@dokploy/server/custom/backups/keep-latest-by-run";
import { parseListedDatabases } from "@dokploy/server/custom/backups/parse-listed-databases";
import {
	normalizeBackupDatabaseFields,
	resolveBackupDatabases,
	sanitizeBackupDbFilePart,
} from "@dokploy/server/custom/backups/resolve-databases";
import { describe, expect, test } from "vitest";

describe("resolveBackupDatabases", () => {
	test("prefers databases array", () => {
		expect(
			resolveBackupDatabases({ database: "a", databases: ["x", "y"] }),
		).toEqual(["x", "y"]);
	});
	test("falls back to legacy database", () => {
		expect(resolveBackupDatabases({ database: "legacy" })).toEqual(["legacy"]);
	});
	test("trims and drops empties", () => {
		expect(resolveBackupDatabases({ databases: [" a ", "", "b"] })).toEqual([
			"a",
			"b",
		]);
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
	test("filename pattern parts", () => {
		const part = sanitizeBackupDbFilePart("app-db");
		const ts = "2026-07-23T00-00-00-000Z";
		expect(`${part}-${ts}.sql.gz`).toBe(
			"app-db-2026-07-23T00-00-00-000Z.sql.gz",
		);
	});
	test("multi-db filenames stay unique", () => {
		const ts = "2026-07-23T00-00-00-000Z";
		const a = `${sanitizeBackupDbFilePart("app")}-${ts}.sql.gz`;
		const b = `${sanitizeBackupDbFilePart("other")}-${ts}.sql.gz`;
		expect(a).not.toBe(b);
	});
});

describe("parseListedDatabases", () => {
	test("filters mysql system dbs", () => {
		expect(
			parseListedDatabases(
				"mysql",
				"mysql\napp\ninformation_schema\nfoo\nsys\nperformance_schema",
			),
		).toEqual(["app", "foo"]);
	});
	test("filters mongo system dbs", () => {
		expect(parseListedDatabases("mongo", "admin\nlocal\nconfig\napp")).toEqual([
			"app",
		]);
	});
	test("keeps postgres names", () => {
		expect(parseListedDatabases("postgres", "dokploy\napp")).toEqual([
			"dokploy",
			"app",
		]);
	});
});

describe("keepLatest by run", () => {
	const t1 = "2026-07-23T10-00-00-000Z";
	const t2 = "2026-07-23T11-00-00-000Z";
	const t3 = "2026-07-23T12-00-00-000Z";

	test("extracts shared run timestamp", () => {
		expect(extractBackupRunId(`app-${t1}.sql.gz`)).toBe(t1);
		expect(extractBackupRunId(`${t1}.sql.gz`)).toBe(t1);
		expect(extractBackupRunId(`other-${t1}.bson.gz`)).toBe(t1);
	});

	test("keeps N runs not N files (multi-db)", () => {
		const files = [
			`a-${t1}.sql.gz`,
			`b-${t1}.sql.gz`,
			`a-${t2}.sql.gz`,
			`b-${t2}.sql.gz`,
			`a-${t3}.sql.gz`,
			`b-${t3}.sql.gz`,
		];
		// keep 2 latest runs (t3, t2) → delete t1's 2 files
		const del = selectBackupFilesToDelete(files, 2);
		expect(del.sort()).toEqual([`a-${t1}.sql.gz`, `b-${t1}.sql.gz`].sort());
	});

	test("legacy single-file runs still work", () => {
		const files = [`${t1}.sql.gz`, `${t2}.sql.gz`, `${t3}.sql.gz`];
		expect(selectBackupFilesToDelete(files, 2).sort()).toEqual(
			[`${t1}.sql.gz`].sort(),
		);
	});
});
