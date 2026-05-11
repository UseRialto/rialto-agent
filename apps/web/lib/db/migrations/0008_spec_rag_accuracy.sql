CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
ALTER TABLE "project_spec_chunks" ADD COLUMN IF NOT EXISTS "parent_chunk_id" integer;
--> statement-breakpoint
ALTER TABLE "project_spec_chunks" ADD COLUMN IF NOT EXISTS "chunk_type" text DEFAULT 'child' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_spec_chunks" ADD COLUMN IF NOT EXISTS "canonical_section_number" text;
--> statement-breakpoint
ALTER TABLE "project_spec_chunks" ADD COLUMN IF NOT EXISTS "token_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_spec_chunks" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
--> statement-breakpoint
ALTER TABLE "bid_spec_compliance_items" ADD COLUMN IF NOT EXISTS "retrieval_diagnostics_json" text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bid_spec_compliance_items" ADD COLUMN IF NOT EXISTS "product_lookup_json" text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "spec_product_lookup_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"lookup_key" text NOT NULL,
	"vendor_sku" text,
	"manufacturer" text,
	"model" text,
	"provider" text,
	"status" text DEFAULT 'skipped' NOT NULL,
	"query" text,
	"result_json" text DEFAULT '{}' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "spec_product_lookup_cache_lookup_key_unique" ON "spec_product_lookup_cache" USING btree ("lookup_key");
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_project_spec_chunks_section";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_spec_chunks_section" ON "project_spec_chunks" USING btree ("project_id","canonical_section_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_spec_chunks_embedding" ON "project_spec_chunks" USING hnsw ("embedding" vector_cosine_ops) WHERE "embedding" IS NOT NULL;
--> statement-breakpoint
UPDATE "project_spec_chunks"
SET "canonical_section_number" = regexp_replace(coalesce("section_number", ''), '[^0-9]', '', 'g'),
    "token_count" = greatest(1, ceil(length("content") / 4.0)::integer)
WHERE "canonical_section_number" IS NULL OR "token_count" = 0;
