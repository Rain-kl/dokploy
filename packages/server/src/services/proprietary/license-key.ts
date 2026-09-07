import { db } from "@dokploy/server/db";
import { organization, organizationRole } from "@dokploy/server/db/schema";
import { and, eq } from "drizzle-orm";

// CUSTOM-FEATURE: [Unlock Enterprise] START (修改背景: 移除 License 合法性校验，企业功能全开)
/**
 * Enterprise license gate — always grants access.
 * Remote license validation against licenses-api.dokploy.com has been removed.
 */
export const hasValidLicense = async (_organizationId: string) => {
	return true;
};
// CUSTOM-FEATURE: [Unlock Enterprise] END

export const resolveOrganizationDefaultRole = async (
	organizationId: string,
) => {
	const org = await db.query.organization.findFirst({
		where: eq(organization.id, organizationId),
		columns: { defaultRole: true },
	});
	const defaultRole = org?.defaultRole;

	if (!defaultRole || defaultRole === "owner") {
		return "member";
	}

	if (defaultRole === "admin" || defaultRole === "member") {
		return defaultRole;
	}

	const customRole = await db.query.organizationRole.findFirst({
		where: and(
			eq(organizationRole.organizationId, organizationId),
			eq(organizationRole.role, defaultRole),
		),
		columns: { id: true },
	});

	if (!customRole || !(await hasValidLicense(organizationId))) {
		return "member";
	}

	return defaultRole;
};
