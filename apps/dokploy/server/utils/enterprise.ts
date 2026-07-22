// CUSTOM-FEATURE: [Unlock Enterprise] START (修改背景: 本地化 License 激活/校验/注销，不再请求官方节点)

/** Always valid; no outbound request to licenses-api.dokploy.com. */
export const validateLicenseKey = async (_licenseKey: string) => {
	return true;
};

/** Local no-op activate; persists only via the caller DB update. */
export const activateLicenseKey = async (licenseKey: string) => {
	return { success: true, licenseKey };
};

/** Local no-op deactivate. */
export const deactivateLicenseKey = async (_licenseKey: string) => {
	return { success: true };
};
// CUSTOM-FEATURE: [Unlock Enterprise] END
