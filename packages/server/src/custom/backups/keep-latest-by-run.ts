/**
 * Group dump filenames into backup "runs" by shared timestamp suffix.
 * Multi-db files: `{db}-{ISO-timestamp}.sql.gz`
 * Legacy single: `{ISO-timestamp}.sql.gz`
 * Web server: `{...}.zip`
 */
const RUN_TS =
	/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.(?:sql\.gz|bson\.gz|zip)$/;

export const extractBackupRunId = (fileName: string): string | null => {
	const base = fileName.split("/").pop() || fileName;
	const m = base.match(RUN_TS);
	return m?.[1] ?? null;
};

/**
 * Keep the latest N *runs* (not files). Files without a parseable run id
 * are treated as their own run keyed by filename.
 */
export const selectBackupFilesToDelete = (
	fileNames: string[],
	keepLatestCount: number,
): string[] => {
	if (keepLatestCount <= 0) return [];

	const byRun = new Map<string, string[]>();
	for (const name of fileNames) {
		const runId = extractBackupRunId(name) ?? name;
		const list = byRun.get(runId) ?? [];
		list.push(name);
		byRun.set(runId, list);
	}

	// Run ids sort reverse lexicographically; ISO-like timestamps work with sort -r
	const runIds = [...byRun.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
	const deleteIds = runIds.slice(keepLatestCount);
	return deleteIds.flatMap((id) => byRun.get(id) ?? []);
};
