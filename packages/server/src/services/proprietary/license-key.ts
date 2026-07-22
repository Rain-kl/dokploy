// CUSTOM-FEATURE: [Unlock Enterprise] START (修改背景: 移除 License 合法性校验，企业功能全开)
/**
 * Enterprise license gate — always grants access.
 * Remote license validation against licenses-api.dokploy.com has been removed.
 */
export const hasValidLicense = async (_organizationId: string) => {
	return true;
};
// CUSTOM-FEATURE: [Unlock Enterprise] END
