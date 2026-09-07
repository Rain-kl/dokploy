import { normalizeBackupDatabaseFields } from "@dokploy/server/custom/backups/resolve-databases";
import { db } from "@dokploy/server/db";
import { type apiCreateBackup, backups } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";

export type Backup = typeof backups.$inferSelect;

export type BackupSchedule = Awaited<ReturnType<typeof findBackupById>>;
export type BackupScheduleList = Awaited<ReturnType<typeof findBackupsByDbId>>;
export const createBackup = async (input: z.infer<typeof apiCreateBackup>) => {
	// CUSTOM-FEATURE: multi-database-backup START
	const { database, databases } = normalizeBackupDatabaseFields({
		database: input.database,
		databases: input.databases as string[] | undefined,
	});
	// CUSTOM-FEATURE: multi-database-backup END
	const newBackup = await db
		.insert(backups)
		.values({ ...input, database, databases } as typeof backups.$inferInsert)
		.returning()
		.then((value) => value[0]);

	if (!newBackup) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating the Backup",
		});
	}

	return newBackup;
};

export const findBackupById = async (backupId: string) => {
	const backup = await db.query.backups.findFirst({
		where: eq(backups.backupId, backupId),
		with: {
			postgres: true,
			mysql: true,
			mariadb: true,
			mongo: true,
			libsql: true,
			destination: {
				columns: {
					accessKey: false,
					secretAccessKey: false,
				},
			},
			compose: true,
		},
	});
	if (!backup) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Backup not found",
		});
	}
	return backup;
};

export const updateBackupById = async (
	backupId: string,
	backupData: Partial<Backup>,
) => {
	// CUSTOM-FEATURE: multi-database-backup START
	let data = { ...backupData };
	if (backupData.database !== undefined || backupData.databases !== undefined) {
		// Prefer explicit databases list; empty array falls back via resolve helpers
		const normalized = normalizeBackupDatabaseFields({
			database: backupData.database,
			databases:
				backupData.databases && backupData.databases.length > 0
					? backupData.databases
					: undefined,
		});
		data = { ...data, ...normalized };
	}
	// CUSTOM-FEATURE: multi-database-backup END
	const result = await db
		.update(backups)
		.set({
			...data,
		})
		.where(eq(backups.backupId, backupId))
		.returning();

	return result[0];
};

export const removeBackupById = async (backupId: string) => {
	const result = await db
		.delete(backups)
		.where(eq(backups.backupId, backupId))
		.returning();

	return result[0];
};

export const findBackupsByDbId = async (
	id: string,
	type: "postgres" | "mysql" | "mariadb" | "mongo" | "libsql",
) => {
	const result = await db.query.backups.findMany({
		where: eq(backups[`${type}Id`], id),
		with: {
			postgres: true,
			mysql: true,
			mariadb: true,
			mongo: true,
			libsql: true,
			destination: {
				columns: {
					accessKey: false,
					secretAccessKey: false,
				},
			},
		},
	});
	return result || [];
};
