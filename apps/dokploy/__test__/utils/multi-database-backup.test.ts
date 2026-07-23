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
		expect(resolveBackupDatabases({ database: "legacy" })).toEqual([
			"legacy",
		]);
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
});
