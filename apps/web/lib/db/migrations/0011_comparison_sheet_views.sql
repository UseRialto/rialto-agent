CREATE TABLE IF NOT EXISTS "comparison_sheet_views" (
	"rfq_id" text PRIMARY KEY NOT NULL,
	"view_json" text DEFAULT '{}' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "comparison_sheet_views_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action
);
