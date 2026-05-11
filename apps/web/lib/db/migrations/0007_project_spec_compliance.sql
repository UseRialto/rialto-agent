CREATE TABLE "project_spec_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"filename" text NOT NULL,
	"file_url" text NOT NULL,
	"mime_type" text DEFAULT 'application/pdf' NOT NULL,
	"size_bytes" integer,
	"page_count" integer,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"extraction_error" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_spec_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"project_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"page_start" integer NOT NULL,
	"page_end" integer NOT NULL,
	"section_number" text,
	"section_title" text,
	"content" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid_spec_compliance_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"bid_id" text NOT NULL,
	"rfq_id" text NOT NULL,
	"project_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"summary_status" text DEFAULT 'needs_review' NOT NULL,
	"high_severity_count" integer DEFAULT 0 NOT NULL,
	"checked_at" text NOT NULL,
	"model" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "bid_spec_compliance_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"bid_id" text NOT NULL,
	"rfq_line_item_id" text,
	"status" text NOT NULL,
	"severity" text DEFAULT 'low' NOT NULL,
	"requirement_summary" text DEFAULT '' NOT NULL,
	"vendor_summary" text DEFAULT '' NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"suggested_follow_up" text,
	"evidence_json" text DEFAULT '[]' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bid_line_items" ADD COLUMN "quoted_product_details" text;
--> statement-breakpoint
ALTER TABLE "project_spec_documents" ADD CONSTRAINT "project_spec_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_spec_chunks" ADD CONSTRAINT "project_spec_chunks_document_id_project_spec_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."project_spec_documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_spec_chunks" ADD CONSTRAINT "project_spec_chunks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bid_spec_compliance_reports" ADD CONSTRAINT "bid_spec_compliance_reports_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bid_spec_compliance_reports" ADD CONSTRAINT "bid_spec_compliance_reports_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bid_spec_compliance_reports" ADD CONSTRAINT "bid_spec_compliance_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bid_spec_compliance_items" ADD CONSTRAINT "bid_spec_compliance_items_report_id_bid_spec_compliance_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."bid_spec_compliance_reports"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bid_spec_compliance_items" ADD CONSTRAINT "bid_spec_compliance_items_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bid_spec_compliance_items" ADD CONSTRAINT "bid_spec_compliance_items_rfq_line_item_id_rfq_line_items_id_fk" FOREIGN KEY ("rfq_line_item_id") REFERENCES "public"."rfq_line_items"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_project_spec_documents_project_status" ON "project_spec_documents" USING btree ("project_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "project_spec_chunks_document_chunk_unique" ON "project_spec_chunks" USING btree ("document_id","chunk_index");
--> statement-breakpoint
CREATE INDEX "idx_project_spec_chunks_project" ON "project_spec_chunks" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "idx_project_spec_chunks_section" ON "project_spec_chunks" USING btree ("project_id","section_number");
--> statement-breakpoint
CREATE INDEX "idx_project_spec_chunks_fts" ON "project_spec_chunks" USING gin (to_tsvector('english', coalesce("section_number",'') || ' ' || coalesce("section_title",'') || ' ' || coalesce("content",'')));
--> statement-breakpoint
CREATE UNIQUE INDEX "bid_spec_compliance_reports_bid_unique" ON "bid_spec_compliance_reports" USING btree ("bid_id");
--> statement-breakpoint
CREATE INDEX "idx_bid_spec_compliance_reports_rfq" ON "bid_spec_compliance_reports" USING btree ("rfq_id");
--> statement-breakpoint
CREATE INDEX "idx_bid_spec_compliance_items_report" ON "bid_spec_compliance_items" USING btree ("report_id");
--> statement-breakpoint
CREATE INDEX "idx_bid_spec_compliance_items_bid_item" ON "bid_spec_compliance_items" USING btree ("bid_id","rfq_line_item_id");
