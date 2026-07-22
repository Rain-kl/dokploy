// CUSTOM-FEATURE: [Traefik 解耦] START (纯前端与后端轻量可共用的常量声明，无 Node 原生模块依赖)
export const ENABLE_TRAEFIK =
	process.env.NEXT_PUBLIC_ENABLE_TRAEFIK === "true" ||
	process.env.ENABLE_TRAEFIK === "true";
// CUSTOM-FEATURE: [Traefik 解耦] END
