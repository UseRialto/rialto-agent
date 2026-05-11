ALTER TABLE "rfq_invites" ADD COLUMN "vendor_name" text;
ALTER TABLE "rfq_invites" ADD COLUMN "vendor_first_name" text;
ALTER TABLE "rfq_invites" ADD COLUMN "vendor_last_name" text;
ALTER TABLE "rfq_invites" ADD COLUMN "on_platform" boolean DEFAULT false NOT NULL;
