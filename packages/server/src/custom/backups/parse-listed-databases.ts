export type ListableDatabaseType = "postgres" | "mysql" | "mariadb" | "mongo";

const SYSTEM_MYSQL = new Set([
	"information_schema",
	"performance_schema",
	"mysql",
	"sys",
]);
const SYSTEM_MONGO = new Set(["admin", "local", "config"]);

export const parseListedDatabases = (
	type: ListableDatabaseType,
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
