"use client";

import { Loader2, LogIn } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { api } from "@/utils/api";

interface SignInWithSSOProps {
	/** Content shown when SSO is collapsed (e.g. email/password form) */
	children?: React.ReactNode;
	/** When true, SSO is the only option — no fallback to email/password */
	enforce?: boolean;
}

// CUSTOM-FEATURE: [SSO One-Click Login/Link]
// One-click SSO: resolve provider by id (no email / domain discovery).
export function SignInWithSSO({
	children,
	enforce = false,
}: SignInWithSSOProps) {
	const [linkingProviderId, setLinkingProviderId] = useState<string | null>(
		null,
	);
	const { data: providers = [], isPending } =
		api.sso.listPublicProviders.useQuery();

	const signInWithProvider = async (providerId: string) => {
		setLinkingProviderId(providerId);
		try {
			const { data, error } = await authClient.signIn.sso({
				providerId,
				callbackURL: "/dashboard/home",
			});
			if (error) {
				toast.error(error.message ?? "Failed to sign in with SSO");
				setLinkingProviderId(null);
				return;
			}
			if (data?.url) {
				window.location.href = data.url;
				return;
			}
			toast.error("SSO provider did not return a redirect URL");
			setLinkingProviderId(null);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to sign in with SSO",
			);
			setLinkingProviderId(null);
		}
	};

	const ssoButtons =
		isPending || providers.length === 0 ? (
			<div className="mb-4 space-y-2">
				{isPending ? (
					<Button type="button" variant="outline" className="w-full" disabled>
						<Loader2 className="mr-2 size-4 animate-spin" />
						Loading SSO...
					</Button>
				) : (
					<p className="text-center text-sm text-muted-foreground">
						No SSO provider configured.
					</p>
				)}
			</div>
		) : providers.length === 1 ? (
			<div className="mb-4 space-y-2">
				<Button
					type="button"
					variant="outline"
					className="w-full"
					disabled={!!linkingProviderId}
					onClick={() => signInWithProvider(providers[0]!.providerId)}
				>
					{linkingProviderId === providers[0]!.providerId ? (
						<Loader2 className="mr-2 size-4 animate-spin" />
					) : (
						<LogIn className="mr-2 size-4" />
					)}
					Sign in with SSO
				</Button>
			</div>
		) : (
			<div className="mb-4 space-y-2">
				<p className="text-center text-xs text-muted-foreground">
					Sign in with your organization SSO
				</p>
				{providers.map((provider) => (
					<Button
						key={provider.providerId}
						type="button"
						variant="outline"
						className="w-full"
						disabled={!!linkingProviderId}
						onClick={() => signInWithProvider(provider.providerId)}
					>
						{linkingProviderId === provider.providerId ? (
							<Loader2 className="mr-2 size-4 animate-spin" />
						) : (
							<LogIn className="mr-2 size-4" />
						)}
						{provider.providerId}
					</Button>
				))}
			</div>
		);

	if (enforce) {
		return ssoButtons;
	}

	return (
		<div className="mb-4 space-y-2">
			{ssoButtons}
			{children}
		</div>
	);
}
