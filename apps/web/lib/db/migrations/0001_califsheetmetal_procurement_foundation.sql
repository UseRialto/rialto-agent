ALTER TABLE "rfqs" ADD COLUMN "request_type" text DEFAULT 'rfq' NOT NULL;
ALTER TABLE "rfqs" ADD COLUMN "anonymous_public_listing" boolean DEFAULT false NOT NULL;
ALTER TABLE "rfqs" ADD COLUMN "desired_outcome" text;
ALTER TABLE "rfqs" ADD COLUMN "performance_requirements" text;
ALTER TABLE "rfqs" ADD COLUMN "site_conditions" text;
ALTER TABLE "rfqs" ADD COLUMN "unknowns_or_questions" text;
ALTER TABLE "rfqs" ADD COLUMN "vendor_guidance_requested" text;
ALTER TABLE "rfqs" ADD COLUMN "attachments_summary" text;
ALTER TABLE "rfqs" ADD COLUMN "procurement_requirements_json" text;
ALTER TABLE "rfqs" ADD COLUMN "ai_spec_assistant_json" text;
ALTER TABLE "rfqs" ADD COLUMN "commodity_watch_json" text;
ALTER TABLE "rfqs" ADD COLUMN "risk_flags_json" text;
ALTER TABLE "rfqs" ADD COLUMN "source_rfq_id" text;

ALTER TABLE "rfq_line_items" ADD COLUMN "constraints" text;
ALTER TABLE "rfq_line_items" ADD COLUMN "attributes_json" text;

ALTER TABLE "bids" ADD COLUMN "payment_terms" text;
ALTER TABLE "bids" ADD COLUMN "deposit_terms" text;
ALTER TABLE "bids" ADD COLUMN "credit_terms" text;
ALTER TABLE "bids" ADD COLUMN "escalation_clause" text;
ALTER TABLE "bids" ADD COLUMN "price_valid_until" text;
ALTER TABLE "bids" ADD COLUMN "shipping_terms" text;
ALTER TABLE "bids" ADD COLUMN "compliance_declarations_json" text;
ALTER TABLE "bids" ADD COLUMN "risk_flags_json" text;
ALTER TABLE "bids" ADD COLUMN "fulfillment_summary_json" text;
ALTER TABLE "bids" ADD COLUMN "buyer_decision_status" text;
ALTER TABLE "bids" ADD COLUMN "decision_rationale" text;
ALTER TABLE "bids" ADD COLUMN "vendor_reliability_flag" text;

ALTER TABLE "bid_line_items" ADD COLUMN "quoted_quantity" real;
ALTER TABLE "bid_line_items" ADD COLUMN "substitution_notes" text;

CREATE TABLE "vendor_relationships" (
  "id" serial PRIMARY KEY NOT NULL,
  "contractor_user_id" text NOT NULL,
  "vendor_id" text,
  "vendor_email" text NOT NULL,
  "vendor_name" text DEFAULT '' NOT NULL,
  "trusted_status" text DEFAULT 'neutral' NOT NULL,
  "rating" integer DEFAULT 3 NOT NULL,
  "terms_history_summary" text DEFAULT '' NOT NULL,
  "qualification_notes" text DEFAULT '' NOT NULL,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);
ALTER TABLE "vendor_relationships" ADD CONSTRAINT "vendor_relationships_contractor_user_id_users_id_fk" FOREIGN KEY ("contractor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "vendor_relationships_contractor_vendor_email_unique" ON "vendor_relationships" USING btree ("contractor_user_id","vendor_email");

CREATE TABLE "negotiation_messages" (
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
ALTER TABLE "negotiation_messages" ADD CONSTRAINT "negotiation_messages_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "negotiation_messages" ADD CONSTRAINT "negotiation_messages_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "idx_negotiation_messages_rfq_bid" ON "negotiation_messages" USING btree ("rfq_id","bid_id");
