# Rialto

Rialto is a two-sided construction procurement marketplace built in Next.js. Contractors create projects and RFQs/RFPs, vendors submit bids, contractors compare pricing, coverage, and lead times, and awarded platform bids flow into PO and order tracking.

## App Location

Run all app commands from `apps/insiteai-web`.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript strict mode
- Tailwind CSS
- Neon Postgres via Drizzle ORM and `@neondatabase/serverless`
- JWT auth in the `insiteai_session` httpOnly cookie

## Local Development

```bash
cd apps/insiteai-web
pnpm dev
```

App URL: [http://localhost:3000](http://localhost:3000)

Useful commands:

```bash
pnpm build
pnpm exec tsc --noEmit
pnpm db:generate
pnpm db:migrate
node scripts/seed.js
```

## Database

The app uses hosted Neon Postgres. Set `DATABASE_URL` in `.env.local`, then run:

```bash
pnpm db:migrate
node scripts/seed.js
```

Core relationship flow:

```text
users
  -> projects
    -> rfqs
      -> rfq_line_items
      -> rfq_invites
      -> bids
        -> bid_line_items
      -> orders
        -> order_stage_progress
```

Email integration adds:

```text
contractor_mailboxes
rfq_vendor_requests
rfq_email_messages
rfq_email_attachments
rfq_magic_links
rfq_quote_responses
rfq_quote_line_items
rfq_review_tasks
```

## Test Accounts

All seeded accounts use password `password123`.

Contractors:

- `sarah@mccarthy.com`
- `mike@turner.com`

Vendors:

- `david@pacificsteel.com`
- `anna@consolidated.com`

More seeded accounts live in `docs/test-accounts.txt`.

## RFQ Authoring and AI

The contractor RFQ/RFP wizard lives in `app/contractor/projects/[projectId]/rfqs/new/_components/`.

- `RFQWizard.tsx` owns the three-step flow: Items, Invite Vendors, Review.
- `StepItems.tsx` owns title/deadline, AI Spec Assistant, CSV import, item cards, supplier requirements, and RFP detail fields.
- Reference files are uploaded from the AI Spec Assistant panel and persisted in `attachment_urls`.
- CSV line-item upload sits above the item cards and accepts SKU, description, quantity, unit, specs, constraints, certifications, notes, target budget, and suggested lead time.
- `StepInviteVendors.tsx` owns marketplace visibility, vendor search/invites, and the AI vendor outreach email editor.
- Draft RFQs/RFPs should reopen the wizard with `?rfqId=...&step=review`.

AI request authoring lives in `lib/ai/request-authoring.ts`.

- AI features use the single Rialto Agent OpenAI core and require `OPENAI_API_KEY` when deterministic fallback is not enough.
- Optional selector: `OPENAI_MODEL` defaults to `gpt-5-mini`.
- Vendor outreach draft generation can fall back to a deterministic template if no LLM key is configured.

## Bid Comparison Rules

- Lowest bid labels only apply to full-coverage bids.
- Partial bids must show sourced quantity versus requested quantity.
- SKU-by-SKU cells show extended price, unit price, lead time, availability, and sourceable quantity.
- Magic-link quote totals are computed as `unit_price * units_available` when units are available, otherwise `unit_price * quoted_quantity`.
- Email-origin bids remain compare-only in v1 and cannot receive PO awards.

## Mailbox RFQ Quote-Return Flow

V1 supports exact-sender mailbox auth for Google Workspace/Gmail and Microsoft 365 inside the web app for off-platform RFQ invite emails.

What it does:

- Contractors connect Google Workspace/Gmail or Microsoft 365 in Settings and use that exact mailbox for RFQ sends.
- Publishing an RFQ sends PDFs and unique magic-form links to off-platform invite emails.
- Replies are synced manually from the RFQ detail page.
- Email bodies, PDFs, and CSV attachments are parsed into quote artifacts.
- Parsed off-platform quotes are projected into normal marketplace `bids` rows with `source = 'email'`.
- Low-confidence matches create inline review tasks and keep the projected bid in `under_review`.
- Email-origin bids are compare-only in v1 and cannot receive a PO.

What it does not do in v1:

- No background worker, webhook, or scheduled sync.
- No generic SMTP/IMAP provider support.
- No standalone global review queue.
- No off-platform PO acceptance or fulfillment flow.

## Mailbox OAuth Setup

Set one or both provider configurations before starting the app:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/auth/microsoft/callback
MICROSOFT_TENANT_ID=common
```

Notes:

- `GOOGLE_REDIRECT_URI` and `MICROSOFT_REDIRECT_URI` are optional if you use the default local callback routes above.
- The Google OAuth app and Microsoft app registration must allow the exact redirect URI you use locally.
- Missing or invalid env vars do not crash the app. Contractor settings will show the mailbox as not configured.

Required mailbox scopes are requested by the app for sending RFQ emails and reading synced inbox/thread content.

### Microsoft 365 app registration

Create a Microsoft Entra ID app registration configured for delegated Graph access:

- **Supported account types**: use "Accounts in any organizational directory" for multi-tenant Microsoft 365 contractor mailboxes, or single-tenant if this deployment only serves one Entra tenant.
- **Redirect URI**: add `http://localhost:3000/api/auth/microsoft/callback` for local dev and `https://your-domain.com/api/auth/microsoft/callback` for production.
- **Client secret**: create a web client secret and copy its value into `MICROSOFT_CLIENT_SECRET`.
- **API permissions**: add delegated Microsoft Graph permissions `openid`, `email`, `profile`, `offline_access`, `User.Read`, `Mail.Read`, and `Mail.Send`.
- **Consent**: grant admin consent when the tenant blocks user consent for mail permissions.

Use `MICROSOFT_TENANT_ID=common` for the broadest contractor-mailbox compatibility. Use a concrete tenant ID only when the deployment should allow one Microsoft tenant.

## Local Verification Flow

Use this sequence for a manual end-to-end check:

1. Run `pnpm db:migrate`.
2. Run `node scripts/seed.js`.
3. Start the app with `pnpm dev`.
4. Open `/login` and sign in as a contractor.
5. Connect a Gmail or Microsoft 365 mailbox in contractor settings.
6. Create an RFQ with off-platform invite emails.
7. Confirm each recipient gets the PDF plus a unique magic-form link from the connected exact sender address.
8. Submit or update a quote from the magic link.
9. Confirm the contractor bid comparison page shows coverage, sourceable quantity, lead time, and lowest full-coverage bid state.
10. Reply from the vendor mailbox on the same thread with plain text, PDF, or CSV quote content.
11. Run `Sync Replies` and confirm the reply appears in the RFQ detail page and updates the bid dashboard.

## Seeded Email Demo Data

The seed script includes a demo mailbox thread for RFQ `rfq-s001-b`:

- one off-platform vendor request row for `bids@nucor.com`
- one outbound mailbox-origin RFQ message
- one inbound quote reply on the same thread
- one parsed quote response with line items
- one open review task
- one projected marketplace bid with `source = 'email'`

This gives the contractor RFQ page enough data to verify the mailbox panel and compare-only email bid state without a live mailbox connection.

## Key Files

- `lib/db/schema.ts`
- `lib/mail/service.ts`
- `lib/ai/request-authoring.ts`
- `lib/actions/contractor.ts`
- `lib/store/contractor-store.ts`
- `app/contractor/settings/page.tsx`
- `app/contractor/projects/[projectId]/rfqs/new/_components/StepItems.tsx`
- `app/contractor/projects/[projectId]/rfqs/new/_components/StepInviteVendors.tsx`
- `app/contractor/projects/[projectId]/rfqs/[rfqId]/page.tsx`
- `app/contractor/projects/[projectId]/rfqs/[rfqId]/_components/BidSkuTable.tsx`
- `app/contractor/projects/[projectId]/rfqs/[rfqId]/_components/RFQMailboxPanel.tsx`
- `app/vendor/magic-rfq/[token]/_components/MagicRFQFormClient.tsx`
- `app/api/auth/google/start/route.ts`
- `app/api/auth/google/callback/route.ts`
- `app/api/auth/google/disconnect/route.ts`
- `scripts/seed.js`
