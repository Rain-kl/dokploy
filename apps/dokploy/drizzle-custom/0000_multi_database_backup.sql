-- CUSTOM-FEATURE: multi-database-backup
-- Isolated from upstream drizzle/ chain to avoid tag/idx conflicts on upgrade.
ALTER TABLE "backup" ADD COLUMN IF NOT EXISTS "databases" jsonb;--> statement-breakpoint
UPDATE "backup" SET "databases" = jsonb_build_array("database") WHERE "databases" IS NULL;
