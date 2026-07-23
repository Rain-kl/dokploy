import {
	resolveBackupDatabases,
	sanitizeBackupDbFilePart,
} from "@dokploy/server/custom/backups/resolve-databases";
import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { Compose } from "@dokploy/server/services/compose";
import {
	createDeploymentBackup,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";
import { findDestinationById } from "@dokploy/server/services/destination";
import { findEnvironmentById } from "@dokploy/server/services/environment";
import { findProjectById } from "@dokploy/server/services/project";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import {
	getBackupCommand,
	getBackupTimestamp,
	getS3Credentials,
	normalizeS3Path,
} from "./utils";

export const runComposeBackup = async (
	compose: Compose,
	backup: BackupSchedule,
) => {
	const { environmentId, name, appName } = compose;
	const environment = await findEnvironmentById(environmentId);
	const project = await findProjectById(environment.projectId);
	const { prefix, databaseType, serviceName } = backup;
	const destination = await findDestinationById(backup.destinationId);
	// CUSTOM-FEATURE: multi-database-backup START
	const dbNames = resolveBackupDatabases(backup);
	if (dbNames.length === 0) {
		throw new Error("No database names configured for backup");
	}
	const timestamp = getBackupTimestamp();
	const ext = databaseType === "mongo" ? "bson" : "sql";
	// CUSTOM-FEATURE: multi-database-backup END
	const s3AppName = serviceName ? `${appName}_${serviceName}` : appName;
	const deployment = await createDeploymentBackup({
		backupId: backup.backupId,
		title: "Compose Backup",
		description: "Compose Backup",
	});

	try {
		const rcloneFlags = getS3Credentials(destination);

		// CUSTOM-FEATURE: multi-database-backup START
		for (const dbName of dbNames) {
			const backupFileName = `${sanitizeBackupDbFilePart(dbName)}-${timestamp}.${ext}.gz`;
			const bucketDestination = `${s3AppName}/${normalizeS3Path(prefix)}${backupFileName}`;
			const rcloneDestination = `:s3:${destination.bucket}/${bucketDestination}`;
			const rcloneCommand = `rclone rcat ${rcloneFlags.join(" ")} "${rcloneDestination}"`;
			const backupCommand = getBackupCommand(
				backup,
				rcloneCommand,
				deployment.logPath,
				dbName,
			);
			if (compose.serverId) {
				await execAsyncRemote(compose.serverId, backupCommand);
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
			databaseType: getDatabaseType(databaseType),
			type: "success",
			organizationId: project.organizationId,
			databaseName: dbNames.join(", "),
		});

		await updateDeploymentStatus(deployment.deploymentId, "done");
	} catch (error) {
		console.log(error);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: getDatabaseType(databaseType),
			type: "error",
			// @ts-ignore
			errorMessage: error?.message || "Error message not provided",
			organizationId: project.organizationId,
			databaseName: dbNames.join(", "),
		});

		await updateDeploymentStatus(deployment.deploymentId, "error");
		throw error;
	}
};

const getDatabaseType = (databaseType: BackupSchedule["databaseType"]) => {
	if (databaseType === "mongo") {
		return "mongodb";
	}
	if (databaseType === "postgres") {
		return "postgres";
	}
	if (databaseType === "mariadb") {
		return "mariadb";
	}
	if (databaseType === "mysql") {
		return "mysql";
	}
	return "mongodb";
};
