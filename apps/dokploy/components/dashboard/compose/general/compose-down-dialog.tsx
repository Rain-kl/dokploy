// CUSTOM-FEATURE: [Compose Restart/Down]
import { ArrowDownToLine } from "lucide-react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

interface Props {
	composeId: string;
	isLoading?: boolean;
	disabled?: boolean;
	onSuccess?: () => void;
}

export const ComposeDownDialog = ({
	composeId,
	isLoading,
	disabled,
	onSuccess,
}: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [selectedVolumes, setSelectedVolumes] = useState<string[]>([]);

	const { data: volumes = [], isFetching } = api.compose.getVolumes.useQuery(
		{ composeId },
		{ enabled: isOpen && !!composeId },
	);

	const { mutateAsync: down, isPending } = api.compose.down.useMutation();

	useEffect(() => {
		if (!isOpen) {
			setSelectedVolumes([]);
		}
	}, [isOpen]);

	const toggleVolume = (volume: string, checked: boolean) => {
		setSelectedVolumes((prev) =>
			checked ? [...prev, volume] : prev.filter((v) => v !== volume),
		);
	};

	const handleDown = async () => {
		await down({
			composeId,
			volumesToRemove: selectedVolumes,
		})
			.then(() => {
				toast.success(
					selectedVolumes.length > 0
						? "Compose down completed and selected volumes removed"
						: "Compose down completed successfully",
				);
				setIsOpen(false);
				onSuccess?.();
			})
			.catch(() => {
				toast.error("Error running compose down");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="destructive"
					isLoading={isLoading || isPending}
					disabled={disabled}
					className="flex items-center gap-1.5 group focus-visible:ring-2 focus-visible:ring-offset-2"
				>
					<Tooltip>
						<TooltipTrigger asChild>
							<div className="flex items-center">
								<ArrowDownToLine className="size-4 mr-1" />
								Down
							</div>
						</TooltipTrigger>
						<TooltipPrimitive.Portal>
							<TooltipContent sideOffset={5} className="z-60">
								<p>Stop and remove containers, optionally delete volumes</p>
							</TooltipContent>
						</TooltipPrimitive.Portal>
					</Tooltip>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Compose Down</DialogTitle>
					<DialogDescription>
						This will stop and remove containers and networks for this compose.
						Optionally select volumes to remove after down.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-3 max-h-64 overflow-y-auto py-2">
					{isFetching ? (
						<p className="text-sm text-muted-foreground">Loading volumes…</p>
					) : volumes.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No volumes found for this compose project.
						</p>
					) : (
						volumes.map((volume) => (
							<div key={volume} className="flex items-center gap-2">
								<Checkbox
									id={`volume-${volume}`}
									checked={selectedVolumes.includes(volume)}
									onCheckedChange={(checked) =>
										toggleVolume(volume, checked === true)
									}
								/>
								<Label
									htmlFor={`volume-${volume}`}
									className="text-sm font-normal cursor-pointer break-all"
								>
									{volume}
								</Label>
							</div>
						))
					)}
				</div>
				<DialogFooter>
					<Button variant="secondary" onClick={() => setIsOpen(false)}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						isLoading={isPending}
						onClick={handleDown}
					>
						{selectedVolumes.length > 0
							? `Down & Remove ${selectedVolumes.length} Volume(s)`
							: "Down"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
