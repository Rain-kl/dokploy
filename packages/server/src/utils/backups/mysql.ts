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
import type { MySql } from "@dokploy/server/services/mysql";
import { findProjectById } from "@dokploy/server/services/project";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import {
	getBackupCommand,
	getBackupTimestamp,
	getS3Credentials,
	normalizeS3Path,
} from "./utils";

export const runMySqlBackup = async (mysql: MySql, backup: BackupSchedule) => {
	const { environmentId, name, appName } = mysql;
	const environment = await findEnvironmentById(environmentId);
	const project = await findProjectById(environment.projectId);
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
	const deployment = await createDeploymentBackup({
		backupId: backup.backupId,
		title: "MySQL Backup",
		description: "MySQL Backup",
	});

	try {
		const rcloneFlags = getS3Credentials(destination);

		// CUSTOM-FEATURE: multi-database-backup START
		for (const dbName of dbNames) {
			currentDb = dbName;
			const backupFileName = `${sanitizeBackupDbFilePart(dbName)}-${timestamp}.sql.gz`;
			const bucketDestination = `${appName}/${normalizeS3Path(prefix)}${backupFileName}`;
			const rcloneDestination = `:s3:${destination.bucket}/${bucketDestination}`;
			const rcloneCommand = `rclone rcat ${rcloneFlags.join(" ")} "${rcloneDestination}"`;
			const backupCommand = getBackupCommand(
				backup,
				rcloneCommand,
				deployment.logPath,
				dbName,
			);
			if (mysql.serverId) {
				await execAsyncRemote(mysql.serverId, backupCommand);
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
			databaseType: "mysql",
			type: "success",
			organizationId: project.organizationId,
			databaseName: dbNames.join(", "),
		});
		await updateDeploymentStatus(deployment.deploymentId, "done");
	} catch (error) {
		console.log(error);
		// CUSTOM-FEATURE: multi-database-backup
		const errMsg =
			// @ts-ignore
			error?.message || "Error message not provided";
		await appendBackupLog(
			deployment.logPath,
			`❌ Failed while backing up database: ${currentDb} — ${errMsg}`,
			mysql.serverId,
		);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mysql",
			type: "error",
			errorMessage: errMsg,
			organizationId: project.organizationId,
			databaseName: dbNames.join(", "),
		});
		await updateDeploymentStatus(deployment.deploymentId, "error");
		throw error;
	}
};
