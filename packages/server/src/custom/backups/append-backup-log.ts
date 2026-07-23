import { appendFile } from "node:fs/promises";
import { quote } from "shell-quote";
import { execAsync, execAsyncRemote } from "../../utils/process/execAsync";

/** Append a line to deployment backup log (local or remote). */
export const appendBackupLog = async (
	logPath: string,
	message: string,
	serverId?: string | null,
) => {
	if (!logPath) return;
	const line = `[${new Date().toISOString()}] ${message}\n`;
	try {
		if (serverId) {
			const cmd = `printf %s ${quote([line])} >> ${quote([logPath])}`;
			await execAsyncRemote(serverId, cmd);
		} else {
			await appendFile(logPath, line);
		}
	} catch {
		// best-effort logging for diagnostics
	}
};
