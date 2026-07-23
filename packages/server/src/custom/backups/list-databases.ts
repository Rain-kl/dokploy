import { quote } from "shell-quote";
import {
	getComposeContainerCommand,
	getServiceContainerCommand,
} from "../../utils/backups/utils";
import { execAsync, execAsyncRemote } from "../../utils/process/execAsync";
import {
	type ListableDatabaseType,
	parseListedDatabases,
} from "./parse-listed-databases";

export type { ListableDatabaseType };
export { parseListedDatabases };

export type ListDatabasesInput = {
	databaseType: ListableDatabaseType;
	appName: string;
	serverId?: string | null;
	databaseUser?: string;
	databasePassword?: string;
	databaseRootPassword?: string;
	composeType?: "stack" | "docker-compose";
	serviceName?: string | null;
	backupType?: "database" | "compose";
};

export const getListDatabasesInnerCommand = (
	type: ListDatabasesInput["databaseType"],
	creds: Pick<
		ListDatabasesInput,
		"databaseUser" | "databasePassword" | "databaseRootPassword"
	>,
): string => {
	switch (type) {
		case "postgres":
			return `docker exec -e DB_USER=${quote([creds.databaseUser || ""])} -i $CONTAINER_ID bash -c 'psql -h localhost -U "$DB_USER" -d postgres -tAc "SELECT datname FROM pg_database WHERE datistemplate = false AND datallowconn"'`;
		case "mysql":
			return `docker exec -e DB_PASS=${quote([creds.databaseRootPassword || ""])} -i $CONTAINER_ID bash -c 'mysql -uroot -p"$DB_PASS" -N -e "SHOW DATABASES"'`;
		case "mariadb":
			return `docker exec -e DB_USER=${quote([creds.databaseUser || ""])} -e DB_PASS=${quote([creds.databasePassword || ""])} -i $CONTAINER_ID bash -c 'mariadb -u"$DB_USER" -p"$DB_PASS" -N -e "SHOW DATABASES"'`;
		case "mongo":
			return `docker exec -e DB_USER=${quote([creds.databaseUser || ""])} -e DB_PASS=${quote([creds.databasePassword || ""])} -i $CONTAINER_ID bash -c 'mongosh --quiet -u "$DB_USER" -p "$DB_PASS" --authenticationDatabase admin --eval "db.adminCommand({ listDatabases: 1 }).databases.map(d => d.name).join(\\"\\n\\")"'`;
		default:
			throw new Error("Unsupported type");
	}
};

export const listDatabasesForService = async (
	input: ListDatabasesInput,
): Promise<{ databases: string[]; warning?: string }> => {
	const containerSearch =
		input.backupType === "compose" && input.serviceName
			? getComposeContainerCommand(
					input.appName,
					input.serviceName,
					input.composeType,
				)
			: getServiceContainerCommand(input.appName);

	const inner = getListDatabasesInnerCommand(input.databaseType, input);
	const script = `
set -e
CONTAINER_ID=$(${containerSearch})
if [ -z "$CONTAINER_ID" ]; then
  echo "CONTAINER_NOT_FOUND" >&2
  exit 1
fi
${inner}
`;
	try {
		const result = input.serverId
			? await execAsyncRemote(input.serverId, script)
			: await execAsync(script, { shell: "/bin/bash" });
		const stdout =
			typeof result === "string"
				? result
				: ((result as { stdout?: string }).stdout ?? String(result));
		return { databases: parseListedDatabases(input.databaseType, stdout) };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to list databases";
		return { databases: [], warning: message };
	}
};
