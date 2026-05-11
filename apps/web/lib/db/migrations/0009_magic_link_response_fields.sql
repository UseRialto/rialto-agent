ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "vendor_response_fields_json" text;
--> statement-breakpoint
ALTER TABLE "bid_line_items" ADD COLUMN IF NOT EXISTS "response_attributes_json" text;
--> statement-breakpoint
ALTER TABLE "bid_line_items" ADD COLUMN IF NOT EXISTS "is_alternate" boolean DEFAULT false NOT NULL;
