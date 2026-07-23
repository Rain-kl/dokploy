import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import {
	CheckIcon,
	ChevronsUpDown,
	DatabaseZap,
	PenBoxIcon,
	PlusIcon,
	RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "@/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { ScheduleFormField } from "../../application/schedules/handle-schedules";

// CUSTOM-FEATURE: multi-database-backup
const MULTI_DB_TYPES = ["postgres", "mysql", "mariadb", "mongo"] as const;

type CacheType = "cache" | "fetch";

type DatabaseType =
	| "postgres"
	| "mariadb"
	| "mysql"
	| "mongo"
	| "web-server"
	| "libsql";

const Schema = z
	.object({
		destinationId: z.string().min(1, "Destination required"),
		schedule: z.string().min(1, "Schedule (Cron) required"),
		prefix: z.string().min(1, "Prefix required"),
		enabled: z.boolean(),
		includeEncryptionKey: z.boolean(),
		// CUSTOM-FEATURE: multi-database-backup START
		database: z.string().optional(),
		databases: z.array(z.string().min(1)).optional(),
		// CUSTOM-FEATURE: multi-database-backup END
		keepLatestCount: z.coerce.number().optional(),
		serviceName: z.string().nullable(),
		databaseType: z
			.enum(["postgres", "mariadb", "mysql", "mongo", "web-server", "libsql"])
			.optional(),
		backupType: z.enum(["database", "compose"]),
		metadata: z
			.object({
				postgres: z
					.object({
						databaseUser: z.string(),
					})
					.optional(),
				mariadb: z
					.object({
						databaseUser: z.string(),
						databasePassword: z.string(),
						// CUSTOM-FEATURE: multi-database-backup — root for full DB list
						databaseRootPassword: z.string().optional(),
					})
					.optional(),
				mongo: z
					.object({
						databaseUser: z.string(),
						databasePassword: z.string(),
					})
					.optional(),
				mysql: z
					.object({
						databaseRootPassword: z.string(),
					})
					.optional(),
			})
			.optional(),
	})
	.superRefine((data, ctx) => {
		// CUSTOM-FEATURE: multi-database-backup START
		const dtype = data.databaseType;
		if (dtype && (MULTI_DB_TYPES as readonly string[]).includes(dtype)) {
			if (!data.databases?.length) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Select at least one database",
					path: ["databases"],
				});
			}
		} else if (dtype === "web-server" || dtype === "libsql") {
			if (!data.database?.trim()) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Database required",
					path: ["database"],
				});
			}
		}
		// CUSTOM-FEATURE: multi-database-backup END

		if (data.backupType === "compose" && !data.databaseType) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Database type is required for compose backups",
				path: ["databaseType"],
			});
		}

		if (data.backupType === "compose" && !data.serviceName) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Service name is required for compose backups",
				path: ["serviceName"],
			});
		}

		if (data.backupType === "compose" && data.databaseType) {
			if (data.databaseType === "postgres") {
				if (!data.metadata?.postgres?.databaseUser) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Database user is required for PostgreSQL",
						path: ["metadata", "postgres", "databaseUser"],
					});
				}
			} else if (data.databaseType === "mariadb") {
				if (!data.metadata?.mariadb?.databaseUser) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Database user is required for MariaDB",
						path: ["metadata", "mariadb", "databaseUser"],
					});
				}
				if (!data.metadata?.mariadb?.databasePassword) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Database password is required for MariaDB",
						path: ["metadata", "mariadb", "databasePassword"],
					});
				}
				// CUSTOM-FEATURE: multi-database-backup — dump/list need root
				if (!data.metadata?.mariadb?.databaseRootPassword) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Root password is required for MariaDB backups",
						path: ["metadata", "mariadb", "databaseRootPassword"],
					});
				}
			} else if (data.databaseType === "mongo") {
				if (!data.metadata?.mongo?.databaseUser) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Database user is required for MongoDB",
						path: ["metadata", "mongo", "databaseUser"],
					});
				}
				if (!data.metadata?.mongo?.databasePassword) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Database password is required for MongoDB",
						path: ["metadata", "mongo", "databasePassword"],
					});
				}
			} else if (data.databaseType === "mysql") {
				if (!data.metadata?.mysql?.databaseRootPassword) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Root password is required for MySQL",
						path: ["metadata", "mysql", "databaseRootPassword"],
					});
				}
			}
		}
	});

interface Props {
	id?: string;
	backupId?: string;
	databaseType?: DatabaseType;
	refetch: () => void;
	backupType: "database" | "compose";
}

export const HandleBackup = ({
	id,
	backupId,
	databaseType = "postgres",
	refetch,
	backupType = "database",
}: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	// CUSTOM-FEATURE: multi-database-backup
	const [manualDb, setManualDb] = useState("");

	const { data, isPending } = api.destination.all.useQuery();
	const { data: backup } = api.backup.one.useQuery(
		{
			backupId: backupId ?? "",
		},
		{
			enabled: !!backupId,
		},
	);
	const [cacheType, setCacheType] = useState<CacheType>("cache");
	const { mutateAsync: createBackup, isPending: isCreatingPostgresBackup } =
		backupId
			? api.backup.update.useMutation()
			: api.backup.create.useMutation();

	const form = useForm({
		defaultValues: {
			database:
				databaseType === "web-server"
					? "dokploy"
					: databaseType === "libsql"
						? "iku.db"
						: "",
			// CUSTOM-FEATURE: multi-database-backup
			databases: [] as string[],
			destinationId: "",
			enabled: true,
			includeEncryptionKey: true,
			prefix: "/",
			schedule: "",
			keepLatestCount: undefined,
			serviceName: null,
			databaseType: backupType === "compose" ? undefined : databaseType,
			backupType: backupType,
			metadata: {},
		},
		resolver: zodResolver(Schema),
	});

	const {
		data: services,
		isFetching: isLoadingServices,
		error: errorServices,
		refetch: refetchServices,
	} = api.compose.loadServices.useQuery(
		{
			composeId: backup?.composeId ?? id ?? "",
			type: cacheType,
		},
		{
			retry: false,
			refetchOnWindowFocus: false,
			enabled: backupType === "compose" && !!backup?.composeId && !!id,
		},
	);

	// CUSTOM-FEATURE: multi-database-backup START
	const watchedType = form.watch("databaseType") ?? databaseType;
	const watchedService = form.watch("serviceName");
	const watchedMetadata = form.watch("metadata");
	const canList =
		(MULTI_DB_TYPES as readonly string[]).includes(watchedType || "") &&
		(backupType !== "compose" || !!watchedService);

	const {
		data: listed,
		isFetching: isListing,
		refetch: refetchDatabases,
	} = api.backup.listDatabases.useQuery(
		{
			databaseType: watchedType as "postgres" | "mysql" | "mariadb" | "mongo",
			backupType,
			postgresId: databaseType === "postgres" ? id : undefined,
			mysqlId: databaseType === "mysql" ? id : undefined,
			mariadbId: databaseType === "mariadb" ? id : undefined,
			mongoId: databaseType === "mongo" ? id : undefined,
			composeId: backupType === "compose" ? id : undefined,
			serviceName: watchedService || undefined,
			metadata: watchedMetadata,
		},
		{ enabled: isOpen && canList && !!id, retry: false },
	);
	// CUSTOM-FEATURE: multi-database-backup END

	useEffect(() => {
		form.reset({
			database: backup?.database
				? backup?.database
				: databaseType === "web-server"
					? "dokploy"
					: databaseType === "libsql"
						? "iku.db"
						: "",
			// CUSTOM-FEATURE: multi-database-backup START
			databases: backup?.databases?.length
				? backup.databases
				: backup?.database
					? [backup.database]
					: [],
			// CUSTOM-FEATURE: multi-database-backup END
			destinationId: backup?.destinationId ?? "",
			enabled: backup?.enabled ?? true,
			includeEncryptionKey: backup?.includeEncryptionKey ?? true,
			prefix: backup?.prefix ?? "/",
			schedule: backup?.schedule ?? "",
			keepLatestCount: backup?.keepLatestCount ?? undefined,
			serviceName: backup?.serviceName ?? null,
			databaseType: backup?.databaseType ?? databaseType,
			backupType: backup?.backupType ?? backupType,
			metadata: backup?.metadata ?? {},
		});
	}, [form, form.reset, backupId, backup]);

	const onSubmit = async (data: z.infer<typeof Schema>) => {
		const getDatabaseId =
			backupType === "compose"
				? {
						composeId: id,
					}
				: databaseType === "postgres"
					? {
							postgresId: id,
						}
					: databaseType === "mariadb"
						? {
								mariadbId: id,
							}
						: databaseType === "mysql"
							? {
									mysqlId: id,
								}
							: databaseType === "mongo"
								? {
										mongoId: id,
									}
								: databaseType === "libsql"
									? {
											libsqlId: id,
										}
									: databaseType === "web-server"
										? {
												userId: id,
											}
										: undefined;

		// CUSTOM-FEATURE: multi-database-backup START
		const multi = (MULTI_DB_TYPES as readonly string[]).includes(
			data.databaseType || databaseType || "",
		);
		// CUSTOM-FEATURE: multi-database-backup END

		await createBackup({
			destinationId: data.destinationId,
			prefix: data.prefix,
			schedule: data.schedule,
			enabled: data.enabled,
			includeEncryptionKey: data.includeEncryptionKey,
			// CUSTOM-FEATURE: multi-database-backup START
			database: multi ? data.databases![0]! : data.database!,
			databases: multi ? data.databases : data.database ? [data.database] : [],
			// CUSTOM-FEATURE: multi-database-backup END
			keepLatestCount: data.keepLatestCount ?? null,
			databaseType: data.databaseType || databaseType,
			serviceName: data.serviceName,
			...getDatabaseId,
			backupId: backupId ?? "",
			backupType,
			metadata: data.metadata,
		})
			.then(async () => {
				toast.success(`Backup ${backupId ? "Updated" : "Created"}`);
				refetch();
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(`Error ${backupId ? "updating" : "creating"} a backup`);
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{backupId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10 size-8"
					>
						<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button>
						<PlusIcon className="h-4 w-4" />
						{backupId ? "Update Backup" : "Create Backup"}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{backupId ? "Update Backup" : "Create Backup"}
					</DialogTitle>
					<DialogDescription>
						{backupId ? "Update a backup" : "Add a new backup"}
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form
						id="hook-form-add-backup"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="grid grid-cols-1 gap-4">
							{errorServices && (
								<AlertBlock type="warning" className="wrap-anywhere">
									{errorServices?.message}
								</AlertBlock>
							)}
							{backupType === "compose" && (
								<FormField
									control={form.control}
									name="databaseType"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Database Type</FormLabel>
											<Select
												value={field.value}
												onValueChange={(value) => {
													field.onChange(value as DatabaseType);
													form.setValue("metadata", {});
												}}
											>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Select a database type" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="postgres">PostgreSQL</SelectItem>
													<SelectItem value="mariadb">MariaDB</SelectItem>
													<SelectItem value="mysql">MySQL</SelectItem>
													<SelectItem value="mongo">MongoDB</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}
							<FormField
								control={form.control}
								name="destinationId"
								render={({ field }) => (
									<FormItem className="">
										<FormLabel>Destination</FormLabel>
										<Popover>
											<PopoverTrigger asChild>
												<FormControl>
													<Button
														variant="outline"
														className={cn(
															"w-full justify-between",
															!field.value && "text-muted-foreground",
														)}
													>
														{isPending
															? "Loading...."
															: field.value
																? data?.find(
																		(destination) =>
																			destination.destinationId === field.value,
																	)?.name
																: "Select Destination"}

														<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
													</Button>
												</FormControl>
											</PopoverTrigger>
											<PopoverContent className="p-0" align="start">
												<Command>
													<CommandInput
														placeholder="Search Destination..."
														className="h-9"
													/>
													{isPending && (
														<span className="py-6 text-center text-sm">
															Loading Destinations....
														</span>
													)}
													<CommandEmpty>No destinations found.</CommandEmpty>
													<ScrollArea className="h-64">
														<CommandGroup>
															{data?.map((destination) => (
																<CommandItem
																	value={destination.destinationId}
																	key={destination.destinationId}
																	onSelect={() => {
																		form.setValue(
																			"destinationId",
																			destination.destinationId,
																		);
																	}}
																>
																	{destination.name}
																	<CheckIcon
																		className={cn(
																			"ml-auto h-4 w-4",
																			destination.destinationId === field.value
																				? "opacity-100"
																				: "opacity-0",
																		)}
																	/>
																</CommandItem>
															))}
														</CommandGroup>
													</ScrollArea>
												</Command>
											</PopoverContent>
										</Popover>

										<FormMessage />
									</FormItem>
								)}
							/>
							{backupType === "compose" && (
								<div className="flex flex-row items-end w-full gap-4">
									<FormField
										control={form.control}
										name="serviceName"
										render={({ field }) => (
											<FormItem className="w-full">
												<FormLabel>Service Name</FormLabel>
												<div className="flex gap-2">
													<Select
														onValueChange={field.onChange}
														value={field.value || undefined}
													>
														<FormControl>
															<SelectTrigger>
																<SelectValue placeholder="Select a service name" />
															</SelectTrigger>
														</FormControl>

														<SelectContent>
															{services?.map((service, index) => (
																<SelectItem
																	value={service}
																	key={`${service}-${index}`}
																>
																	{service}
																</SelectItem>
															))}
															{(!services || services.length === 0) && (
																<SelectItem value="none" disabled>
																	Empty
																</SelectItem>
															)}
														</SelectContent>
													</Select>
													<TooltipProvider delayDuration={0}>
														<Tooltip>
															<TooltipTrigger asChild>
																<Button
																	variant="secondary"
																	type="button"
																	isLoading={isLoadingServices}
																	onClick={() => {
																		if (cacheType === "fetch") {
																			refetchServices();
																		} else {
																			setCacheType("fetch");
																		}
																	}}
																>
																	<RefreshCw className="size-4 text-muted-foreground" />
																</Button>
															</TooltipTrigger>
															<TooltipContent
																side="left"
																sideOffset={5}
																className="max-w-40"
															>
																<p>
																	Fetch: Will clone the repository and load the
																	services
																</p>
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>
													<TooltipProvider delayDuration={0}>
														<Tooltip>
															<TooltipTrigger asChild>
																<Button
																	variant="secondary"
																	type="button"
																	isLoading={isLoadingServices}
																	onClick={() => {
																		if (cacheType === "cache") {
																			refetchServices();
																		} else {
																			setCacheType("cache");
																		}
																	}}
																>
																	<DatabaseZap className="size-4 text-muted-foreground" />
																</Button>
															</TooltipTrigger>
															<TooltipContent
																side="left"
																sideOffset={5}
																className="max-w-40"
															>
																<p>
																	Cache: If you previously deployed this
																	compose, it will read the services from the
																	last deployment/fetch from the repository
																</p>
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>
												</div>

												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
							)}
							{/* CUSTOM-FEATURE: multi-database-backup START */}
							{(MULTI_DB_TYPES as readonly string[]).includes(
								watchedType || "",
							) ? (
								<FormField
									control={form.control}
									name="databases"
									render={({ field }) => {
										const selected = field.value ?? [];
										const options = [
											...new Set([
												...(listed?.databases ?? []),
												...selected,
											]),
										];
										const toggle = (name: string, on: boolean) => {
											if (on) {
												field.onChange(
													selected.includes(name)
														? selected
														: [...selected, name],
												);
											} else {
												field.onChange(selected.filter((n) => n !== name));
											}
										};
										const addManual = () => {
											const name = manualDb.trim();
											if (!name) return;
											if (!selected.includes(name)) {
												field.onChange([...selected, name]);
											}
											setManualDb("");
										};
										return (
											<FormItem>
												<div className="flex items-center justify-between gap-2">
													<FormLabel>Databases</FormLabel>
													<Button
														type="button"
														variant="secondary"
														size="sm"
														isLoading={isListing}
														onClick={() => refetchDatabases()}
													>
														<RefreshCw className="size-3.5" />
													</Button>
												</div>
												{listed?.warning && (
													<p className="text-xs text-muted-foreground">
														{listed.warning}
													</p>
												)}
												{selected.length > 0 && (
													<div className="flex flex-wrap gap-1.5">
														{selected.map((name) => (
															<button
																key={name}
																type="button"
																className="rounded-md border px-2 py-0.5 text-xs hover:bg-muted"
																onClick={() => toggle(name, false)}
															>
																{name} ×
															</button>
														))}
													</div>
												)}
												<ScrollArea className="h-32 rounded-md border p-2">
													{options.length === 0 ? (
														<p className="text-sm text-muted-foreground p-1">
															No databases listed. Add manually below.
														</p>
													) : (
														<div className="space-y-2">
															{options.map((name) => (
																<label
																	key={name}
																	className="flex items-center gap-2 text-sm cursor-pointer"
																>
																	<Checkbox
																		checked={selected.includes(name)}
																		onCheckedChange={(v) =>
																			toggle(name, v === true)
																		}
																	/>
																	{name}
																</label>
															))}
														</div>
													)}
												</ScrollArea>
												<div className="flex gap-2">
													<Input
														placeholder="Add database name"
														value={manualDb}
														onChange={(e) => setManualDb(e.target.value)}
														onKeyDown={(e) => {
															if (e.key === "Enter") {
																e.preventDefault();
																addManual();
															}
														}}
													/>
													<Button
														type="button"
														variant="secondary"
														onClick={addManual}
													>
														Add
													</Button>
												</div>
												<FormDescription>
													Select one or more databases. Each is dumped to its
													own backup file.
												</FormDescription>
												<FormMessage />
											</FormItem>
										);
									}}
								/>
							) : (
								<FormField
									control={form.control}
									name="database"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>Database</FormLabel>
												<FormControl>
													<Input
														disabled={
															databaseType === "web-server" ||
															databaseType === "libsql"
														}
														placeholder={"dokploy"}
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										);
									}}
								/>
							)}
							{/* CUSTOM-FEATURE: multi-database-backup END */}

							<ScheduleFormField name="schedule" formControl={form.control} />

							<FormField
								control={form.control}
								name="prefix"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>Prefix Destination</FormLabel>
											<FormControl>
												<Input placeholder={"dokploy/"} {...field} />
											</FormControl>
											<FormDescription>
												Use if you want to back up in a specific path of your
												destination/bucket
											</FormDescription>

											<FormMessage />
										</FormItem>
									);
								}}
							/>
							<FormField
								control={form.control}
								name="keepLatestCount"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>Keep the latest</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder={"keeps all the backups if left empty"}
													{...field}
													value={field.value as string}
												/>
											</FormControl>
											<FormDescription>
												Optional. If provided, only keeps the latest N backups
												in the cloud.
											</FormDescription>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
							<FormField
								control={form.control}
								name="enabled"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 ">
										<div className="space-y-0.5">
											<FormLabel>Enabled</FormLabel>
											<FormDescription>
												Enable or disable the backup
											</FormDescription>
										</div>
										<FormControl>
											<Switch
												checked={field.value}
												onCheckedChange={field.onChange}
											/>
										</FormControl>
									</FormItem>
								)}
							/>
							{databaseType === "web-server" && (
								<FormField
									control={form.control}
									name="includeEncryptionKey"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 ">
											<div className="space-y-0.5">
												<FormLabel>Include encryption key</FormLabel>
												<FormDescription>
													Stores the encryption key inside the backup so
													environment variables can be restored on a new server.
													Anyone with access to the backup file can decrypt
													them.
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
							)}
							{backupType === "compose" && (
								<>
									{form.watch("databaseType") === "postgres" && (
										<FormField
											control={form.control}
											name="metadata.postgres.databaseUser"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Database User</FormLabel>
													<FormControl>
														<Input placeholder="postgres" {...field} />
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
									)}

									{form.watch("databaseType") === "mariadb" && (
										<>
											<FormField
												control={form.control}
												name="metadata.mariadb.databaseUser"
												render={({ field }) => (
													<FormItem>
														<FormLabel>Database User</FormLabel>
														<FormControl>
															<Input placeholder="mariadb" {...field} />
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												control={form.control}
												name="metadata.mariadb.databasePassword"
												render={({ field }) => (
													<FormItem>
														<FormLabel>Database Password</FormLabel>
														<FormControl>
															<Input
																type="password"
																placeholder="••••••••"
																{...field}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											{/* CUSTOM-FEATURE: multi-database-backup — root for listDatabases */}
											<FormField
												control={form.control}
												name="metadata.mariadb.databaseRootPassword"
												render={({ field }) => (
													<FormItem>
														<FormLabel>Root Password</FormLabel>
														<FormControl>
															<Input
																type="password"
																placeholder="••••••••"
																{...field}
															/>
														</FormControl>
														<FormDescription>
															Required for listing and dumping all databases
															(root). App user only has access to the default
															DB.
														</FormDescription>
														<FormMessage />
													</FormItem>
												)}
											/>
										</>
									)}

									{form.watch("databaseType") === "mongo" && (
										<>
											<FormField
												control={form.control}
												name="metadata.mongo.databaseUser"
												render={({ field }) => (
													<FormItem>
														<FormLabel>Database User</FormLabel>
														<FormControl>
															<Input placeholder="mongo" {...field} />
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												control={form.control}
												name="metadata.mongo.databasePassword"
												render={({ field }) => (
													<FormItem>
														<FormLabel>Database Password</FormLabel>
														<FormControl>
															<Input
																type="password"
																placeholder="••••••••"
																{...field}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
										</>
									)}

									{form.watch("databaseType") === "mysql" && (
										<FormField
											control={form.control}
											name="metadata.mysql.databaseRootPassword"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Root Password</FormLabel>
													<FormControl>
														<Input
															type="password"
															placeholder="••••••••"
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
									)}
								</>
							)}
						</div>
						<DialogFooter>
							<Button
								isLoading={isCreatingPostgresBackup}
								form="hook-form-add-backup"
								type="submit"
							>
								{backupId ? "Update" : "Create"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
