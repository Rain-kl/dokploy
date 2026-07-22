import { db } from "@dokploy/server/db";
import { user } from "@dokploy/server/db/schema";
import { hasValidLicense, validateLicenseKey } from "@dokploy/server/index";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "@/server/api/trpc";
import {
	activateLicenseKey,
	deactivateLicenseKey,
} from "@/server/utils/enterprise";

export const licenseKeyRouter = createTRPCRouter({
	activate: adminProcedure
		.input(z.object({ licenseKey: z.string().min(1) }))
		.mutation(async ({ input, ctx }) => {
			try {
				const currentUserId = ctx.user.id;
				const currentUser = await db.query.user.findFirst({
					where: eq(user.id, currentUserId),
				});
				if (!currentUser) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "User not found",
					});
				}

				if (ctx.user.role !== "owner") {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You are not authorized to activate a license key",
					});
				}

				// CUSTOM-FEATURE: [Unlock Enterprise] START (修改背景: 激活不再校验官方节点 / enable 开关)
				await activateLicenseKey(input.licenseKey);
				await db
					.update(user)
					.set({
						licenseKey: input.licenseKey,
						enableEnterpriseFeatures: true,
						isValidEnterpriseLicense: true,
					})
					.where(eq(user.id, currentUserId));
				// CUSTOM-FEATURE: [Unlock Enterprise] END
				return { success: true };
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Failed to activate license key",
					cause: error,
				});
			}
		}),
	validate: adminProcedure.mutation(async ({ ctx }) => {
		try {
			const currentUserId = ctx.user.id;
			const currentUser = await db.query.user.findFirst({
				where: eq(user.id, currentUserId),
			});
			if (!currentUser) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "User not found",
				});
			}

			if (ctx.user.role !== "owner") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not authorized to validate a license key",
				});
			}

			if (!currentUser.licenseKey) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No license key found",
				});
			}

			// CUSTOM-FEATURE: [Unlock Enterprise] START (修改背景: 本地校验恒 true)
			const valid = await validateLicenseKey(currentUser.licenseKey);
			if (valid) {
				await db
					.update(user)
					.set({
						enableEnterpriseFeatures: true,
						isValidEnterpriseLicense: true,
					})
					.where(eq(user.id, currentUserId));
			}
			// CUSTOM-FEATURE: [Unlock Enterprise] END
			return valid;
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message:
					error instanceof Error
						? error.message
						: "Failed to validate license key",
			});
		}
	}),
	deactivate: adminProcedure.mutation(async ({ ctx }) => {
		try {
			const currentUserId = ctx.user.id;
			const currentUser = await db.query.user.findFirst({
				where: eq(user.id, currentUserId),
			});
			if (!currentUser) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "User not found",
				});
			}
			if (!currentUser.licenseKey) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No license key found",
				});
			}

			if (ctx.user.role !== "owner") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not authorized to deactivate a license key",
				});
			}

			try {
				await deactivateLicenseKey(currentUser.licenseKey);
			} catch (err) {
				console.error("Failed to deactivate license key remotely:", err);
			}

			await db
				.update(user)
				.set({
					licenseKey: null,
					isValidEnterpriseLicense: false,
				})
				.where(eq(user.id, currentUserId));
			return { success: true };
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message:
					error instanceof Error
						? error.message
						: "Failed to deactivate license key",
			});
		}
	}),
	getEnterpriseSettings: adminProcedure.query(async ({ ctx }) => {
		const currentUserId = ctx.user.id;
		const currentUser = await db.query.user.findFirst({
			where: eq(user.id, currentUserId),
		});

		if (!currentUser) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "User not found",
			});
		}

		if (ctx.user.role !== "owner") {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "You are not authorized to get enterprise settings",
			});
		}

		return {
			enableEnterpriseFeatures: !!currentUser.enableEnterpriseFeatures,
			licenseKey: currentUser.licenseKey ?? "",
		};
	}),
	haveValidLicenseKey: protectedProcedure.query(async ({ ctx }) => {
		return await hasValidLicense(ctx.session.activeOrganizationId);
	}),
	updateEnterpriseSettings: adminProcedure
		.input(
			z.object({
				enableEnterpriseFeatures: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const currentUserId = ctx.user.id;

				if (input.enableEnterpriseFeatures === undefined) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "enableEnterpriseFeatures must be provided",
					});
				}

				if (ctx.user.role !== "owner") {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You are not authorized to update enterprise settings",
					});
				}

				await db
					.update(user)
					.set({
						enableEnterpriseFeatures: input.enableEnterpriseFeatures,
					})
					.where(eq(user.id, currentUserId));

				return true;
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Failed to update enterprise settings",
				});
			}
		}),
});
