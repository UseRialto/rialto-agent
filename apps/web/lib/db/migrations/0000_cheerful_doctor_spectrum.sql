CREATE TABLE "bid_line_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"bid_id" text NOT NULL,
	"line_item_id" text NOT NULL,
	"sku" text,
	"description" text,
	"quantity" real,
	"unit" text,
	"unit_price" real NOT NULL,
	"total_price" real NOT NULL,
	"lead_time_days" integer DEFAULT 0 NOT NULL,
	"availability" text NOT NULL,
	"units_available" integer,
	"delivery_terms" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "bids" (
	"id" text PRIMARY KEY NOT NULL,
	"rfq_id" text NOT NULL,
	"vendor_id" text,
	"vendor_email" text,
	"vendor_name" text NOT NULL,
	"is_invited" boolean DEFAULT false NOT NULL,
	"is_on_platform" boolean DEFAULT false NOT NULL,
	"submitted_at" text NOT NULL,
	"total_price" real DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"lead_time_days" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"po_number" text,
	"source" text DEFAULT 'platform' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractor_mailboxes" (
	"user_id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"provider_account_id" text DEFAULT '' NOT NULL,
	"provider_sync_cursor" text DEFAULT '' NOT NULL,
	"email_address" text DEFAULT '' NOT NULL,
	"sender_name" text DEFAULT '' NOT NULL,
	"access_token" text DEFAULT '' NOT NULL,
	"refresh_token" text DEFAULT '' NOT NULL,
	"token_expires_at" text DEFAULT '' NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"connected_at" text DEFAULT '' NOT NULL,
	"auth_state" text DEFAULT '' NOT NULL,
	"gmail_history_id" text DEFAULT '' NOT NULL,
	"last_sync_at" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_stage_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"stage" text NOT NULL,
	"completed_at" text,
	"notes" text,
	"carrier" text,
	"tracking_number" text,
	"ship_date" text
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"rfq_id" text NOT NULL,
	"bid_id" text NOT NULL,
	"project_id" text NOT NULL,
	"vendor_id" text,
	"vendor_name" text NOT NULL,
	"po_number" text NOT NULL,
	"agreed_price" real NOT NULL,
	"delivery_date" text,
	"delivery_location" text,
	"awarded_at" text NOT NULL,
	"current_stage" text DEFAULT 'confirmed' NOT NULL,
	"line_items_snapshot" text
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"description" text,
	"budget" real,
	"status" text DEFAULT 'active' NOT NULL,
	"collaborator_ids" text,
	"rfq_categories" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfq_email_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_message_id" integer NOT NULL,
	"filename" text DEFAULT '' NOT NULL,
	"mime_type" text DEFAULT '' NOT NULL,
	"file_path" text DEFAULT '' NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"extracted_text" text DEFAULT '' NOT NULL,
	"extraction_confidence" real DEFAULT 0 NOT NULL,
	"source_kind" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfq_email_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"contractor_user_id" text NOT NULL,
	"gmail_message_id" text NOT NULL,
	"gmail_thread_id" text DEFAULT '' NOT NULL,
	"internet_message_id" text DEFAULT '' NOT NULL,
	"rfq_id" text,
	"vendor_request_id" integer,
	"direction" text DEFAULT '' NOT NULL,
	"match_status" text DEFAULT 'unassigned' NOT NULL,
	"match_confidence" real DEFAULT 0 NOT NULL,
	"match_reason" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"normalized_subject" text DEFAULT '' NOT NULL,
	"from_email" text DEFAULT '' NOT NULL,
	"from_name" text DEFAULT '' NOT NULL,
	"to_json" text DEFAULT '[]' NOT NULL,
	"cc_json" text DEFAULT '[]' NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"text_body" text DEFAULT '' NOT NULL,
	"html_body" text DEFAULT '' NOT NULL,
	"sent_at" text DEFAULT '' NOT NULL,
	"is_unread" boolean DEFAULT false NOT NULL,
	"label_json" text DEFAULT '[]' NOT NULL,
	"raw_payload_json" text DEFAULT '{}' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfq_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"rfq_id" text NOT NULL,
	"vendor_id" text,
	"vendor_email" text
);
--> statement-breakpoint
CREATE TABLE "rfq_line_items" (
	"id" text PRIMARY KEY NOT NULL,
	"rfq_id" text NOT NULL,
	"sku" text,
	"description" text NOT NULL,
	"quantity" real NOT NULL,
	"unit" text NOT NULL,
	"specs" text,
	"certifications" text,
	"notes" text,
	"contractor_budget" real,
	"suggested_lead_time_days" integer,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfq_magic_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"rfq_id" text NOT NULL,
	"vendor_request_id" integer NOT NULL,
	"vendor_email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" text NOT NULL,
	"first_opened_at" text,
	"last_submitted_at" text,
	"completed_at" text,
	"revoked_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfq_quote_line_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_response_id" integer NOT NULL,
	"rfq_line_item_id" text,
	"source_name" text DEFAULT '' NOT NULL,
	"normalized_name" text DEFAULT '' NOT NULL,
	"quantity" text DEFAULT '' NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"unit_price" text DEFAULT '' NOT NULL,
	"total_price" text DEFAULT '' NOT NULL,
	"lead_time_text" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfq_quote_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"rfq_id" text NOT NULL,
	"vendor_request_id" integer,
	"email_message_id" integer NOT NULL,
	"source_kind" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'parsed' NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"lead_time_text" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfq_review_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"contractor_user_id" text NOT NULL,
	"rfq_id" text,
	"vendor_request_id" integer,
	"email_message_id" integer,
	"quote_response_id" integer,
	"task_type" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"details_json" text DEFAULT '{}' NOT NULL,
	"resolution_json" text DEFAULT '{}' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfq_vendor_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"rfq_id" text NOT NULL,
	"contractor_user_id" text NOT NULL,
	"vendor_name" text DEFAULT '' NOT NULL,
	"vendor_email" text NOT NULL,
	"vendor_email_domain" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"gmail_thread_id" text DEFAULT '' NOT NULL,
	"outbound_message_id" text DEFAULT '' NOT NULL,
	"last_message_at" text DEFAULT '' NOT NULL,
	"last_message_direction" text DEFAULT '' NOT NULL,
	"match_basis" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfqs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"email_subject" text,
	"email_body" text,
	"category" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"bid_deadline" text,
	"created_at" text NOT NULL,
	"published_at" text,
	"pending_bid_id" text,
	"pending_vendor_id" text,
	"pending_vendor_email" text,
	"pending_offered_at" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"company_info" text,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "bid_line_items" ADD CONSTRAINT "bid_line_items_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_line_items" ADD CONSTRAINT "bid_line_items_line_item_id_rfq_line_items_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."rfq_line_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_mailboxes" ADD CONSTRAINT "contractor_mailboxes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_stage_progress" ADD CONSTRAINT "order_stage_progress_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_email_attachments" ADD CONSTRAINT "rfq_email_attachments_email_message_id_rfq_email_messages_id_fk" FOREIGN KEY ("email_message_id") REFERENCES "public"."rfq_email_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_email_messages" ADD CONSTRAINT "rfq_email_messages_contractor_user_id_users_id_fk" FOREIGN KEY ("contractor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_email_messages" ADD CONSTRAINT "rfq_email_messages_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_email_messages" ADD CONSTRAINT "rfq_email_messages_vendor_request_id_rfq_vendor_requests_id_fk" FOREIGN KEY ("vendor_request_id") REFERENCES "public"."rfq_vendor_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_invites" ADD CONSTRAINT "rfq_invites_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_line_items" ADD CONSTRAINT "rfq_line_items_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_magic_links" ADD CONSTRAINT "rfq_magic_links_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_magic_links" ADD CONSTRAINT "rfq_magic_links_vendor_request_id_rfq_vendor_requests_id_fk" FOREIGN KEY ("vendor_request_id") REFERENCES "public"."rfq_vendor_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_quote_line_items" ADD CONSTRAINT "rfq_quote_line_items_quote_response_id_rfq_quote_responses_id_fk" FOREIGN KEY ("quote_response_id") REFERENCES "public"."rfq_quote_responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_quote_line_items" ADD CONSTRAINT "rfq_quote_line_items_rfq_line_item_id_rfq_line_items_id_fk" FOREIGN KEY ("rfq_line_item_id") REFERENCES "public"."rfq_line_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_quote_responses" ADD CONSTRAINT "rfq_quote_responses_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_quote_responses" ADD CONSTRAINT "rfq_quote_responses_vendor_request_id_rfq_vendor_requests_id_fk" FOREIGN KEY ("vendor_request_id") REFERENCES "public"."rfq_vendor_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_quote_responses" ADD CONSTRAINT "rfq_quote_responses_email_message_id_rfq_email_messages_id_fk" FOREIGN KEY ("email_message_id") REFERENCES "public"."rfq_email_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_review_tasks" ADD CONSTRAINT "rfq_review_tasks_contractor_user_id_users_id_fk" FOREIGN KEY ("contractor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_review_tasks" ADD CONSTRAINT "rfq_review_tasks_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_review_tasks" ADD CONSTRAINT "rfq_review_tasks_vendor_request_id_rfq_vendor_requests_id_fk" FOREIGN KEY ("vendor_request_id") REFERENCES "public"."rfq_vendor_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_review_tasks" ADD CONSTRAINT "rfq_review_tasks_email_message_id_rfq_email_messages_id_fk" FOREIGN KEY ("email_message_id") REFERENCES "public"."rfq_email_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_review_tasks" ADD CONSTRAINT "rfq_review_tasks_quote_response_id_rfq_quote_responses_id_fk" FOREIGN KEY ("quote_response_id") REFERENCES "public"."rfq_quote_responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_vendor_requests" ADD CONSTRAINT "rfq_vendor_requests_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_vendor_requests" ADD CONSTRAINT "rfq_vendor_requests_contractor_user_id_users_id_fk" FOREIGN KEY ("contractor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_contractor_mailboxes_auth_state" ON "contractor_mailboxes" USING btree ("auth_state");--> statement-breakpoint
CREATE UNIQUE INDEX "rfq_email_attachments_message_file_unique" ON "rfq_email_attachments" USING btree ("email_message_id","file_path");--> statement-breakpoint
CREATE UNIQUE INDEX "rfq_email_messages_gmail_message_id_unique" ON "rfq_email_messages" USING btree ("gmail_message_id");--> statement-breakpoint
CREATE INDEX "idx_rfq_email_messages_rfq_sent_at" ON "rfq_email_messages" USING btree ("rfq_id","sent_at");--> statement-breakpoint
CREATE INDEX "idx_rfq_email_messages_thread_sent_at" ON "rfq_email_messages" USING btree ("gmail_thread_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rfq_magic_links_token_hash_unique" ON "rfq_magic_links" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "rfq_magic_links_vendor_request_unique" ON "rfq_magic_links" USING btree ("vendor_request_id");--> statement-breakpoint
CREATE INDEX "idx_rfq_magic_links_rfq_vendor" ON "rfq_magic_links" USING btree ("rfq_id","vendor_email");--> statement-breakpoint
CREATE INDEX "idx_rfq_quote_line_items_quote_response" ON "rfq_quote_line_items" USING btree ("quote_response_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rfq_quote_responses_email_message_id_unique" ON "rfq_quote_responses" USING btree ("email_message_id");--> statement-breakpoint
CREATE INDEX "idx_rfq_review_tasks_status" ON "rfq_review_tasks" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rfq_vendor_requests_rfq_vendor_email_unique" ON "rfq_vendor_requests" USING btree ("rfq_id","vendor_email");--> statement-breakpoint
CREATE INDEX "idx_rfq_vendor_requests_rfq_status" ON "rfq_vendor_requests" USING btree ("rfq_id","status");--> statement-breakpoint
CREATE INDEX "idx_rfq_vendor_requests_thread" ON "rfq_vendor_requests" USING btree ("gmail_thread_id");