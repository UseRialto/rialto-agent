CREATE TABLE IF NOT EXISTS "project_spec_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"trade" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source_document_ids_json" text DEFAULT '[]' NOT NULL,
	"selected_chunk_ids_json" text DEFAULT '[]' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"diagnostics_json" text DEFAULT '{}' NOT NULL,
	"error" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_spec_packages" ADD CONSTRAINT "project_spec_packages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_spec_packages_project_trade_unique" ON "project_spec_packages" USING btree ("project_id","trade");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_spec_packages_project_status" ON "project_spec_packages" USING btree ("project_id","status");
--> statement-breakpoint
ALTER TABLE "bid_spec_compliance_items" ADD COLUMN IF NOT EXISTS "review_kind" text DEFAULT 'line_item' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bid_spec_compliance_items" ADD COLUMN IF NOT EXISTS "substitution_verdict" text;
