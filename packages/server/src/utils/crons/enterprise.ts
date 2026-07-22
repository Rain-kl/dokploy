// CUSTOM-FEATURE: [Unlock Enterprise] START (修改背景: 移除 3 天一次远程 License 校验定时任务)

/** Kept for import compatibility; remote license server is disabled. */
export const LICENSE_KEY_URL = "https://licenses-api.dokploy.com";

/**
 * No-op: previously polled licenses-api.dokploy.com every 3 days and
 * flipped isValidEnterpriseLicense to false on failure.
 */
export const initEnterpriseBackupCronJobs = async () => {
	// Enterprise license remote validation disabled — all features unlocked.
};

/** Always valid; no outbound request to the license server. */
export const validateLicenseKey = async (_licenseKey: string) => {
	return true;
};
// CUSTOM-FEATURE: [Unlock Enterprise] END
