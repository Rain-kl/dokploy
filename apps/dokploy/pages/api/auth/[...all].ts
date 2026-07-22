import { tryHandleSsoAccountLinkCallback } from "@dokploy/server/custom/sso-account-link";
import { auth } from "@dokploy/server/index";
import { toNodeHandler } from "better-auth/node";
import type { NextApiRequest, NextApiResponse } from "next";

// Disallow body parsing, we will parse it manually
export const config = { api: { bodyParser: false } };

const betterAuthHandler = toNodeHandler(auth.handler);

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	// CUSTOM-FEATURE: [SSO One-Click Login/Link]
	// Profile "bind SSO" uses the same OIDC callback path but must attach the
	// OpenID subject to the *current* user without creating/switching accounts.
	if (req.method === "GET") {
		const handled = await tryHandleSsoAccountLinkCallback(req, res);
		if (handled) return;
	}

	return betterAuthHandler(req, res);
}
