import { exec } from "node:child_process";
import { exit } from "node:process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

import { setupDirectories } from "@dokploy/server/setup/config-paths";
import { initializePostgres } from "@dokploy/server/setup/postgres-setup";
import { initializeRedis } from "@dokploy/server/setup/redis-setup";
import {
	initializeNetwork,
	initializeSwarm,
} from "@dokploy/server/setup/setup";
import {
	createDefaultMiddlewares,
	createDefaultServerTraefikConfig,
	createDefaultTraefikConfig,
	initializeStandaloneTraefik,
	TRAEFIK_VERSION,
} from "@dokploy/server/setup/traefik-setup";

// CUSTOM-FEATURE: [Traefik 解耦] START (修改背景: 支持无 Traefik 模式)
import { ENABLE_TRAEFIK } from "@dokploy/server/constants";
// CUSTOM-FEATURE: [Traefik 解耦] END

(async () => {
	try {
		setupDirectories();
		if (ENABLE_TRAEFIK) {
			createDefaultMiddlewares();
		}
		await initializeSwarm();
		await initializeNetwork();
		if (ENABLE_TRAEFIK) {
			createDefaultTraefikConfig();
			createDefaultServerTraefikConfig();
			await execAsync(`docker pull traefik:v${TRAEFIK_VERSION}`);
			await initializeStandaloneTraefik();
		}
		await initializeRedis();
		await initializePostgres();
		console.log("Dokploy setup completed");
		exit(0);
	} catch (e) {
		console.error("Error in dokploy setup", e);
		exit(1);
	}
})();
