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
