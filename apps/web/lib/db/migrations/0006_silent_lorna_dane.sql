CREATE TABLE IF NOT EXISTS "negotiation_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"rfq_id" text NOT NULL,
	"bid_id" text,
	"vendor_id" text,
	"vendor_email" text,
	"author_role" text NOT NULL,
	"author_name" text NOT NULL,
	"message" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_magic_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"vendor_email" text NOT NULL,
	"token_hash" text NOT NULL,
	"reminder_index" integer NOT NULL,
	"send_at" text NOT NULL,
	"sent_at" text,
	"opened_at" text,
	"used_at" text,
	"expires_at" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_relationships" (
	"id" serial PRIMARY KEY NOT NULL,
	"contractor_user_id" text NOT NULL,
	"vendor_email" text NOT NULL,
	"vendor_name" text DEFAULT '' NOT NULL,
	"vendor_id" text,
	"trusted_status" text DEFAULT 'neutral' NOT NULL,
	"rating" integer DEFAULT 3 NOT NULL,
	"terms_history_summary" text DEFAULT '' NOT NULL,
	"qualification_notes" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bid_line_items" ADD COLUMN IF NOT EXISTS "quoted_quantity" real;--> statement-breakpoint
ALTER TABLE "bid_line_items" ADD COLUMN IF NOT EXISTS "substitution_notes" text;--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN IF NOT EXISTS "designer_name" text;--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN IF NOT EXISTS "payment_terms" text;--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN IF NOT EXISTS "deposit_terms" text;--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN IF NOT EXISTS "credit_terms" text;--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN IF NOT EXISTS "escalation_clause" text;--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN IF NOT EXISTS "price_valid_until" text;--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN IF NOT EXISTS "shipping_terms" text;--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN IF NOT EXISTS "compliance_declarations_json" text;--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN IF NOT EXISTS "risk_flags_json" text;--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN IF NOT EXISTS "fulfillment_summary_json" text;--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN IF NOT EXISTS "buyer_decision_status" text;--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN IF NOT EXISTS "decision_rationale" text;--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN IF NOT EXISTS "vendor_reliability_flag" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "ordered_at" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "expected_delivery_date" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "next_follow_up_date" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "follow_up_status" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "follow_up_notes" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "vendor_email" text;--> statement-breakpoint
ALTER TABLE "rfq_invites" ADD COLUMN IF NOT EXISTS "vendor_name" text;--> statement-breakpoint
ALTER TABLE "rfq_invites" ADD COLUMN IF NOT EXISTS "vendor_first_name" text;--> statement-breakpoint
ALTER TABLE "rfq_invites" ADD COLUMN IF NOT EXISTS "vendor_last_name" text;--> statement-breakpoint
ALTER TABLE "rfq_invites" ADD COLUMN IF NOT EXISTS "on_platform" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rfq_line_items" ADD COLUMN IF NOT EXISTS "constraints" text;--> statement-breakpoint
ALTER TABLE "rfq_line_items" ADD COLUMN IF NOT EXISTS "attributes_json" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "request_type" text DEFAULT 'rfq' NOT NULL;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "anonymous_public_listing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "procurement_objective" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "scope_summary" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "desired_outcome" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "performance_requirements" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "approved_alternates" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "quantity_context" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "site_conditions" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "delivery_zip" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "delivery_logistics" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "delivery_window" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "phased_delivery" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "submittals_required" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "lead_time_sensitivity" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "exclusions" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "unknowns_or_questions" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "vendor_questions_requested" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "vendor_guidance_requested" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "attachments_summary" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "procurement_requirements_json" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "ai_spec_assistant_json" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "commodity_watch_json" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "risk_flags_json" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "attachment_urls_json" text;--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "source_rfq_id" text;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "negotiation_messages" ADD CONSTRAINT "negotiation_messages_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "negotiation_messages" ADD CONSTRAINT "negotiation_messages_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "order_magic_links" ADD CONSTRAINT "order_magic_links_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "vendor_relationships" ADD CONSTRAINT "vendor_relationships_contractor_user_id_users_id_fk" FOREIGN KEY ("contractor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_negotiation_messages_rfq_bid" ON "negotiation_messages" USING btree ("rfq_id","bid_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "order_magic_links_token_hash_unique" ON "order_magic_links" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "order_magic_links_order_reminder_unique" ON "order_magic_links" USING btree ("order_id","reminder_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_magic_links_order_send" ON "order_magic_links" USING btree ("order_id","send_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_relationships_contractor_vendor_email_unique" ON "vendor_relationships" USING btree ("contractor_user_id","vendor_email");
