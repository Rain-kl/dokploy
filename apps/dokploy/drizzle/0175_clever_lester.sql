ALTER TABLE "backup" ADD COLUMN "databases" jsonb;--> statement-breakpoint
UPDATE "backup" SET "databases" = jsonb_build_array("database") WHERE "databases" IS NULL;