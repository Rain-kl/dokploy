import { appendBackupLog } from "@dokploy/server/custom/backups/append-backup-log";
import {
	resolveBackupDatabases,
	sanitizeBackupDbFilePart,
} from "@dokploy/server/custom/backups/resolve-databases";
import type { BackupSchedule } from "@dokploy/server/services/backup";
import {
	createDeploymentBackup,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";
import { findDestinationById } from "@dokploy/server/services/destination";
import { findEnvironmentById } from "@dokploy/server/services/environment";
import type { Postgres } from "@dokploy/server/services/postgres";
import { findProjectById } from "@dokploy/server/services/project";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import {
	getBackupCommand,
	getBackupTimestamp,
	getS3Credentials,
	normalizeS3Path,
} from "./utils";

export const runPostgresBackup = async (
	postgres: Postgres,
	backup: BackupSchedule,
) => {
	const { name, environmentId, appName } = postgres;
	const environment = await findEnvironmentById(environmentId);
	const project = await findProjectById(environment.projectId);

	const deployment = await createDeploymentBackup({
		backupId: backup.backupId,
		title: "Initializing Backup",
		description: "Initializing Backup",
	});
	const { prefix } = backup;
	const destination = await findDestinationById(backup.destinationId);
	// CUSTOM-FEATURE: multi-database-backup START
	const dbNames = resolveBackupDatabases(backup);
	if (dbNames.length === 0) {
		throw new Error("No database names configured for backup");
	}
	const timestamp = getBackupTimestamp();
	let currentDb = dbNames[0]!;
	// CUSTOM-FEATURE: multi-database-backup END
	try {
		const rcloneFlags = getS3Credentials(destination);
		// CUSTOM-FEATURE: multi-database-backup START
		for (const dbName of dbNames) {
			currentDb = dbName;
			const backupFileName = `${sanitizeBackupDbFilePart(dbName)}-${timestamp}.sql.gz`;
			const bucketDestination = `${appName}/${normalizeS3Path(prefix)}${backupFileName}`;
			const rcloneDestination = `:s3:${destination.bucket}/${bucketDestination}`;
			const backupCommand = getBackupCommand(
				backup,
				rcloneFlags,
				rcloneDestination,
				deployment.logPath,
				dbName,
			);
			if (postgres.serverId) {
				await execAsyncRemote(postgres.serverId, backupCommand);
			} else {
				await execAsync(backupCommand, {
					shell: "/bin/bash",
				});
			}
		}
		// CUSTOM-FEATURE: multi-database-backup END

		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "postgres",
			type: "success",
			organizationId: project.organizationId,
			databaseName: dbNames.join(", "),
		});

		await updateDeploymentStatus(deployment.deploymentId, "done");
	} catch (error) {
		// CUSTOM-FEATURE: multi-database-backup — log which DB failed
		const errMsg =
			// @ts-ignore
			error?.message || "Error message not provided";
		await appendBackupLog(
			deployment.logPath,
			`❌ Failed while backing up database: ${currentDb} — ${errMsg}`,
			postgres.serverId,
		);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "postgres",
			type: "error",
			errorMessage: errMsg,
			organizationId: project.organizationId,
			databaseName: dbNames.join(", "),
		});

		await updateDeploymentStatus(deployment.deploymentId, "error");

		throw error;
	} finally {
	}
};
