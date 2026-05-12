CREATE TABLE IF NOT EXISTS "comparison_sheet_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"rfq_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"parent_version_id" integer,
	"view_json" text DEFAULT '{}' NOT NULL,
	"source" text DEFAULT 'estimator-edit' NOT NULL,
	"summary" text DEFAULT 'Saved estimator workbook edit.' NOT NULL,
	"actor_user_id" text,
	"proposal_json" text,
	"created_at" text NOT NULL,
	CONSTRAINT "comparison_sheet_versions_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "comparison_sheet_versions_rfq_version_unique" UNIQUE("rfq_id","version_number")
);

ALTER TABLE "comparison_sheet_views" ADD COLUMN IF NOT EXISTS "current_version_id" integer;

CREATE INDEX IF NOT EXISTS "idx_comparison_sheet_versions_rfq_created" ON "comparison_sheet_versions" USING btree ("rfq_id","created_at");
