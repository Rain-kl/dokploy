import { dbUrl } from "@dokploy/server/db";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const sql = postgres(dbUrl, { max: 1 });
const db = drizzle(sql);

try {
	await migrate(db, { migrationsFolder: "drizzle" });
	console.log("Migration complete");

	// CUSTOM-FEATURE: custom-migrations START
	// Second chain: apps/dokploy/drizzle-custom — never shares idx/tag with upstream.
	await migrate(db, {
		migrationsFolder: "drizzle-custom",
		migrationsTable: "drizzle_migrations_custom",
	});
	console.log("Custom migration complete");
	// CUSTOM-FEATURE: custom-migrations END
} catch (error) {
	console.log("Migration failed", error);
} finally {
	await sql.end();
}
