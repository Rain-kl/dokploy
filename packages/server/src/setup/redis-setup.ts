import type { CreateServiceOptions } from "dockerode";
import { docker } from "../constants";
import { pullImage } from "../utils/docker/utils";

export const initializeRedis = async () => {
	// CUSTOM-FEATURE: [Database Image Customization] START (使用 valkey/valkey:8-alpine 镜像)
	const imageName = "valkey/valkey:8-alpine";
	// CUSTOM-FEATURE: [Database Image Customization] END
	const containerName = "dokploy-redis";

	const settings: CreateServiceOptions = {
		Name: containerName,
		TaskTemplate: {
			ContainerSpec: {
				Image: imageName,
				Mounts: [
					{
						Type: "volume",
						Source: "dokploy-redis",
						Target: "/data",
					},
				],
			},
			Networks: [{ Target: "dokploy-network" }],
			Placement: {
				Constraints: ["node.role==manager"],
			},
		},
		Mode: {
			Replicated: {
				Replicas: 1,
			},
		},
		...(process.env.NODE_ENV === "development" && {
			EndpointSpec: {
				Ports: [
					{
						TargetPort: 6379,
						PublishedPort: 6379,
						Protocol: "tcp",
						PublishMode: "host",
					},
				],
			},
		}),
	};
	try {
		await pullImage(imageName);

		const service = docker.getService(containerName);
		const inspect = await service.inspect();
		await service.update({
			version: Number.parseInt(inspect.Version.Index),
			...settings,
		});
		console.log("Redis Started ✅");
	} catch (_) {
		try {
			await docker.createService(settings);
		} catch (error: any) {
			if (error?.statusCode !== 409) {
				throw error;
			}
			console.log("Redis service already exists, continuing...");
		}
		console.log("Redis Not Found: Starting ✅");
	}
};
