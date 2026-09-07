// CUSTOM-FEATURE: [SSO One-Click Login/Link]
// Bind IdP OpenID subject to the *current* Dokploy user.
// Never creates users and never switches session by email.

import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createAuthorizationURL, validateAuthorizationCode } from "better-auth";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db";
import { account, ssoProvider, verification } from "../db/schema";

const LINK_STATE_PREFIX = "sso-link:";
const LINK_TTL_MS = 10 * 60 * 1000;
const PROFILE_PATH = "/dashboard/settings/profile";

type LinkStatePayload = {
	userId: string;
	providerId: string;
	codeVerifier: string;
	redirectUri: string;
	returnTo: string;
};

type OidcConfig = {
	clientId: string;
	clientSecret: string;
	authorizationEndpoint?: string;
	tokenEndpoint?: string;
	userInfoEndpoint?: string;
	jwksEndpoint?: string;
	discoveryEndpoint?: string;
	tokenEndpointAuthentication?: "client_secret_post" | "client_secret_basic";
	scopes?: string[];
	pkce?: boolean;
	mapping?: {
		id?: string;
		email?: string;
		name?: string;
		image?: string;
		emailVerified?: string;
	};
};

const headerValue = (
	req: IncomingMessage,
	name: string,
): string | undefined => {
	const raw = req.headers[name.toLowerCase()];
	if (Array.isArray(raw)) return raw[0];
	return raw;
};

export const getRequestOrigin = (req: IncomingMessage): string => {
	const proto =
		headerValue(req, "x-forwarded-proto")?.split(",")[0]?.trim() || "http";
	const host =
		headerValue(req, "x-forwarded-host")?.split(",")[0]?.trim() ||
		headerValue(req, "host") ||
		"localhost:3000";
	return `${proto}://${host}`;
};

const parseOidcConfig = (raw: string | null): OidcConfig | null => {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as OidcConfig;
	} catch {
		return null;
	}
};

const resolveOidcConfig = async (
	issuer: string,
	config: OidcConfig,
): Promise<OidcConfig> => {
	if (
		config.authorizationEndpoint &&
		config.tokenEndpoint &&
		(config.userInfoEndpoint || config.jwksEndpoint)
	) {
		return config;
	}
	const discoveryUrl =
		config.discoveryEndpoint ||
		`${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;
	const res = await fetch(discoveryUrl, { redirect: "error" });
	if (!res.ok) {
		throw new Error(`OIDC discovery failed (${res.status})`);
	}
	const doc = (await res.json()) as {
		authorization_endpoint?: string;
		token_endpoint?: string;
		userinfo_endpoint?: string;
		jwks_uri?: string;
	};
	return {
		...config,
		authorizationEndpoint:
			config.authorizationEndpoint || doc.authorization_endpoint,
		tokenEndpoint: config.tokenEndpoint || doc.token_endpoint,
		userInfoEndpoint: config.userInfoEndpoint || doc.userinfo_endpoint,
		jwksEndpoint: config.jwksEndpoint || doc.jwks_uri,
	};
};

const randomState = () => randomBytes(24).toString("base64url");
const randomCodeVerifier = () => randomBytes(32).toString("base64url");

export async function startSsoAccountLink(params: {
	userId: string;
	providerId: string;
	origin: string;
	returnTo?: string;
}): Promise<{ url: string }> {
	const provider = await db.query.ssoProvider.findFirst({
		where: eq(ssoProvider.providerId, params.providerId),
	});
	if (!provider) {
		throw new Error("SSO provider not found");
	}
	if (!provider.oidcConfig) {
		throw new Error("Only OIDC providers can be linked from Profile");
	}

	const parsed = parseOidcConfig(provider.oidcConfig);
	if (!parsed?.clientId || !parsed.clientSecret) {
		throw new Error("Invalid OIDC provider configuration");
	}

	const config = await resolveOidcConfig(provider.issuer, parsed);
	if (!config.authorizationEndpoint || !config.tokenEndpoint) {
		throw new Error("OIDC authorization/token endpoint missing");
	}

	const usePkce = config.pkce !== false;
	const state = randomState();
	const codeVerifier = usePkce ? randomCodeVerifier() : "";
	const redirectUri = `${params.origin}/api/auth/sso/callback/${provider.providerId}`;
	const returnTo = params.returnTo || `${params.origin}${PROFILE_PATH}`;

	const payload: LinkStatePayload = {
		userId: params.userId,
		providerId: provider.providerId,
		codeVerifier,
		redirectUri,
		returnTo,
	};

	const now = new Date();
	await db.insert(verification).values({
		id: nanoid(),
		identifier: `${LINK_STATE_PREFIX}${state}`,
		value: JSON.stringify(payload),
		expiresAt: new Date(Date.now() + LINK_TTL_MS),
		createdAt: now,
		updatedAt: now,
	});

	const authorizationURL = await createAuthorizationURL({
		id: provider.issuer,
		options: {
			clientId: config.clientId,
			clientSecret: config.clientSecret,
		},
		redirectURI: redirectUri,
		state,
		codeVerifier: usePkce ? codeVerifier : undefined,
		scopes: config.scopes?.length
			? config.scopes
			: ["openid", "email", "profile"],
		authorizationEndpoint: config.authorizationEndpoint,
	});

	return { url: authorizationURL.toString() };
}

const loadLinkState = async (
	state: string,
): Promise<{ id: string; payload: LinkStatePayload } | null> => {
	const row = await db.query.verification.findFirst({
		where: eq(verification.identifier, `${LINK_STATE_PREFIX}${state}`),
	});
	if (!row) return null;
	if (row.expiresAt.getTime() < Date.now()) {
		await db.delete(verification).where(eq(verification.id, row.id));
		return null;
	}
	try {
		return {
			id: row.id,
			payload: JSON.parse(row.value) as LinkStatePayload,
		};
	} catch {
		await db.delete(verification).where(eq(verification.id, row.id));
		return null;
	}
};

const extractSubject = async (
	config: OidcConfig,
	tokens: {
		accessToken?: string | null;
		idToken?: string | null;
	},
): Promise<string> => {
	const mappingId = config.mapping?.id || "sub";

	if (config.userInfoEndpoint && tokens.accessToken) {
		const res = await fetch(config.userInfoEndpoint, {
			headers: { Authorization: `Bearer ${tokens.accessToken}` },
			redirect: "error",
		});
		if (res.ok) {
			const info = (await res.json()) as Record<string, unknown>;
			const id = info[mappingId] ?? info.sub;
			if (id != null && String(id).length > 0) return String(id);
		}
	}

	if (tokens.idToken) {
		const parts = tokens.idToken.split(".");
		if (parts.length >= 2 && parts[1]) {
			const json = Buffer.from(parts[1], "base64url").toString("utf8");
			const payload = JSON.parse(json) as Record<string, unknown>;
			const id = payload[mappingId] ?? payload.sub;
			if (id != null && String(id).length > 0) return String(id);
		}
	}

	throw new Error("Unable to resolve OpenID subject from IdP");
};

async function linkOpenIdToUser(params: {
	userId: string;
	providerId: string;
	accountId: string;
	accessToken?: string | null;
	refreshToken?: string | null;
	idToken?: string | null;
	accessTokenExpiresAt?: Date;
	refreshTokenExpiresAt?: Date;
	scope?: string;
}) {
	const existingIdentity = await db.query.account.findFirst({
		where: and(
			eq(account.providerId, params.providerId),
			eq(account.accountId, params.accountId),
		),
	});

	if (existingIdentity) {
		if (existingIdentity.userId !== params.userId) {
			throw new Error(
				"This SSO identity is already linked to another Dokploy account",
			);
		}
		// Already linked to the current user — refresh tokens.
		await db
			.update(account)
			.set({
				accessToken: params.accessToken ?? existingIdentity.accessToken,
				refreshToken: params.refreshToken ?? existingIdentity.refreshToken,
				idToken: params.idToken ?? existingIdentity.idToken,
				accessTokenExpiresAt:
					params.accessTokenExpiresAt ?? existingIdentity.accessTokenExpiresAt,
				refreshTokenExpiresAt:
					params.refreshTokenExpiresAt ??
					existingIdentity.refreshTokenExpiresAt,
				scope: params.scope ?? existingIdentity.scope,
				updatedAt: new Date(),
			})
			.where(eq(account.id, existingIdentity.id));
		return;
	}

	const existingForUser = await db.query.account.findFirst({
		where: and(
			eq(account.userId, params.userId),
			eq(account.providerId, params.providerId),
		),
	});

	const now = new Date();
	if (existingForUser) {
		// Replace previous OpenID subject for this provider on the same user.
		await db
			.update(account)
			.set({
				accountId: params.accountId,
				accessToken: params.accessToken ?? null,
				refreshToken: params.refreshToken ?? null,
				idToken: params.idToken ?? null,
				accessTokenExpiresAt: params.accessTokenExpiresAt,
				refreshTokenExpiresAt: params.refreshTokenExpiresAt,
				scope: params.scope,
				updatedAt: now,
			})
			.where(eq(account.id, existingForUser.id));
		return;
	}

	await db.insert(account).values({
		id: nanoid(),
		userId: params.userId,
		providerId: params.providerId,
		accountId: params.accountId,
		accessToken: params.accessToken ?? null,
		refreshToken: params.refreshToken ?? null,
		idToken: params.idToken ?? null,
		accessTokenExpiresAt: params.accessTokenExpiresAt,
		refreshTokenExpiresAt: params.refreshTokenExpiresAt,
		scope: params.scope,
		createdAt: now,
		updatedAt: now,
		is2FAEnabled: false,
	});
}

type RequestWithQuery = IncomingMessage & {
	query?: Record<string, string | string[] | undefined>;
};

const queryParam = (
	req: RequestWithQuery,
	url: URL,
	key: string,
): string | null => {
	const fromUrl = url.searchParams.get(key);
	if (fromUrl) return fromUrl;
	const raw = req.query?.[key];
	if (Array.isArray(raw)) return raw[0] ?? null;
	return raw ?? null;
};

/**
 * If this request is an SSO account-link callback, complete linking and
 * redirect. Returns true when the response was handled (caller must not
 * forward to Better Auth).
 */
export async function tryHandleSsoAccountLinkCallback(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<boolean> {
	const reqWithQuery = req as RequestWithQuery;
	const url = new URL(req.url || "/", "http://localhost");
	// Paths seen by Next catch-all: /api/auth/sso/callback/:providerId
	// or relative /sso/callback/:providerId depending on mount.
	const pathname = url.pathname;
	let providerIdFromPath = "";
	const pathMatch = pathname.match(
		/(?:\/api\/auth)?\/sso\/callback\/([^/?#]+)/,
	);
	if (pathMatch?.[1]) {
		providerIdFromPath = decodeURIComponent(pathMatch[1]);
	} else if (Array.isArray(reqWithQuery.query?.all)) {
		// pages/api/auth/[...all] → ["sso","callback","providerId"]
		const parts = reqWithQuery.query.all.map(String);
		const cbIdx = parts.indexOf("callback");
		if (parts[0] === "sso" && cbIdx >= 0 && parts[cbIdx + 1]) {
			providerIdFromPath = decodeURIComponent(parts[cbIdx + 1]!);
		}
	}
	if (!providerIdFromPath) return false;

	const code = queryParam(reqWithQuery, url, "code");
	const state = queryParam(reqWithQuery, url, "state");
	const oauthError = queryParam(reqWithQuery, url, "error");

	if (!state) return false;

	const link = await loadLinkState(state);
	// Not a link flow — let Better Auth handle normal SSO login.
	if (!link) return false;

	const origin = getRequestOrigin(req);
	const failRedirect = (message: string) => {
		const target = new URL(link.payload.returnTo || `${origin}${PROFILE_PATH}`);
		target.searchParams.set("ssoLinkError", message);
		res.statusCode = 302;
		res.setHeader("Location", target.toString());
		res.end();
	};

	const succeedRedirect = () => {
		const target = new URL(link.payload.returnTo || `${origin}${PROFILE_PATH}`);
		target.searchParams.set("ssoLinked", "1");
		res.statusCode = 302;
		res.setHeader("Location", target.toString());
		res.end();
	};

	// Always consume one-time state.
	await db.delete(verification).where(eq(verification.id, link.id));

	if (oauthError) {
		failRedirect(oauthError);
		return true;
	}
	if (!code) {
		failRedirect("missing_code");
		return true;
	}
	if (link.payload.providerId !== providerIdFromPath) {
		failRedirect("provider_mismatch");
		return true;
	}

	try {
		const provider = await db.query.ssoProvider.findFirst({
			where: eq(ssoProvider.providerId, link.payload.providerId),
		});
		if (!provider?.oidcConfig) {
			failRedirect("provider_not_found");
			return true;
		}
		const parsed = parseOidcConfig(provider.oidcConfig);
		if (!parsed) {
			failRedirect("invalid_oidc_config");
			return true;
		}
		const config = await resolveOidcConfig(provider.issuer, parsed);
		if (!config.tokenEndpoint) {
			failRedirect("missing_token_endpoint");
			return true;
		}

		const tokens = await validateAuthorizationCode({
			code,
			codeVerifier:
				config.pkce === false ? undefined : link.payload.codeVerifier,
			redirectURI: link.payload.redirectUri,
			options: {
				clientId: config.clientId,
				clientSecret: config.clientSecret,
			},
			tokenEndpoint: config.tokenEndpoint,
			authentication:
				config.tokenEndpointAuthentication === "client_secret_post"
					? "post"
					: "basic",
		});

		const accountId = await extractSubject(config, {
			accessToken: tokens.accessToken,
			idToken: tokens.idToken,
		});

		await linkOpenIdToUser({
			userId: link.payload.userId,
			providerId: link.payload.providerId,
			accountId,
			accessToken: tokens.accessToken,
			refreshToken: tokens.refreshToken,
			idToken: tokens.idToken,
			accessTokenExpiresAt: tokens.accessTokenExpiresAt,
			refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
			scope: tokens.scopes?.join(","),
		});

		succeedRedirect();
		return true;
	} catch (error) {
		console.error("[sso-account-link] failed:", error);
		failRedirect(error instanceof Error ? error.message : "sso_link_failed");
		return true;
	}
}
