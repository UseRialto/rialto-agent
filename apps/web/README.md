# Rialto Web App

Rialto is a construction procurement app built in Next.js. In v1, contractors request quotes, vendors return quote responses, and estimators compare quotes. Award, purchase order, and order tracking workflows are outside the active product boundary.

## App Location

Run all app commands from `apps/web`.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript strict mode
- Tailwind CSS
- Neon Postgres via Drizzle ORM and `@neondatabase/serverless`
- JWT auth in the `insiteai_session` httpOnly cookie

## Local Development

```bash
cd apps/web
npm run dev
```

App URL: [http://localhost:3000](http://localhost:3000)

Useful commands:

```bash
npm run build
npm run typecheck
npm run db:generate
npm run db:migrate
node scripts/seed.js
```

## Database

The app uses hosted Neon Postgres. Set `DATABASE_URL` in `.env.local`, then run:

```bash
npm run db:migrate
node scripts/seed.js
```

Core active relationship flow:

```text
users
  -> projects
    -> rfqs
      -> rfq_line_items
      -> rfq_invites
      -> bids
        -> bid_line_items
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

## Product Modules

### Requesting Quotes

The contractor quote request wizard lives in `app/contractor/projects/[projectId]/rfqs/new/_components/`.

- `RFQWizard.tsx` owns the three-step flow: Items, Invite Vendors, Review.
- `StepItems.tsx` owns title/deadline, AI Spec Assistant, CSV import, item cards, vendor requirements, and optional request details.
- Reference files are uploaded from the AI Spec Assistant panel and persisted in `attachment_urls`.
- CSV line-item upload sits above the item cards and accepts SKU, description, quantity, unit, specs, constraints, certifications, notes, target budget, and suggested lead time.
- `StepInviteVendors.tsx` owns vendor search/invites and the AI vendor outreach email editor.
- Draft quote requests should reopen the wizard with `?rfqId=...&step=review`.

AI request authoring lives in `lib/ai/request-authoring.ts`.

- Quote Comparison agent editing uses the single Rialto Agent OpenAI core and requires `OPENAI_API_KEY`; do not add deterministic spreadsheet-edit fallbacks.
- Optional selector: `OPENAI_MODEL` defaults to `gpt-5-mini`.
- Vendor outreach draft generation can fall back to a deterministic template if no LLM key is configured.

### Vendor Response Intake

Vendor Response Intake receives magic-form submissions, email replies, attachments, and external quote imports.

- Magic-form submissions are handled in `lib/magic-rfq/service.ts` and `app/vendor/magic-rfq/[token]/`.
- Email send/sync/extraction lives in `lib/mail/service.ts`.
- External quote imports live in `lib/procurement/external-quote-import.ts` and `app/api/external-quote-import/route.ts`.
- `lib/procurement/vendor-response-intake.ts` converts stored bid rows into Vendor Quote Responses for the workbook handoff.
- Intake code must preserve source artifacts, provenance, review issues, no-bid state, alternates, quantity mismatches, and unit mismatches.

### Quote Comparison

Quote Comparison consumes Vendor Response Workbooks and renders the spreadsheet-like comparison page.

- Lowest complete labels only apply to complete comparable quotes.
- Partial quote totals may be displayed when clearly labeled, but must not win lowest complete comparison.
- Quantity mismatches, unit mismatches, vendor alternates, no-bid lines, and missing values must create visible review caveats.
- SKU-by-SKU cells show extended price, unit price, lead time, availability, and sourceable quantity.
- Magic-link quote totals are computed as `unit_price * units_available` when units are available, otherwise `unit_price * quoted_quantity`.
- Quote Comparison state does not trigger award, vendor notification, purchasing handoff, PO creation, or order tracking.

## Mailbox RFQ Quote-Return Flow

V1 supports exact-sender mailbox auth for Google Workspace/Gmail and Microsoft 365 inside the web app for off-platform RFQ invite emails.

What it does:

- Contractors connect Google Workspace/Gmail or Microsoft 365 in Settings and use that exact mailbox for RFQ sends.
- Publishing an RFQ sends PDFs and unique magic-form links to off-platform invite emails.
- Connected mailboxes are ingested server-side through `/api/mail/ingest`, which is scheduled by `vercel.json`, so vendor replies can populate quote comparison without a contractor opening the RFQ page or clicking sync.
- Google Workspace/Gmail can also register a Gmail push watch when `GOOGLE_GMAIL_PUBSUB_TOPIC` is configured; Pub/Sub push notifications should target `/api/mail/google/push` to trigger near-real-time ingestion.
- Email bodies, PDFs, and CSV attachments are parsed into quote artifacts.
- Parsed off-platform quotes are projected into stored quote response rows with `source = 'email'`.
- Low-confidence matches create inline review tasks, keep the projected bid in `under_review`, and add red Email Reply Review highlights in Quote Comparison until the contractor confirms or corrects the extracted values.
- Email-origin quotes are compare-only in v1 and do not create downstream award or PO workflows.

What it does not do in v1:

- No generic SMTP/IMAP provider support.
- No standalone global review queue.
- No off-platform award, PO acceptance, fulfillment, or order tracking flow.

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

MAIL_INGEST_SECRET=...
CRON_SECRET=...
GOOGLE_GMAIL_PUBSUB_TOPIC=projects/<gcp-project>/topics/<topic-name>
```

Notes:

- `GOOGLE_REDIRECT_URI` and `MICROSOFT_REDIRECT_URI` are optional if you use the default local callback routes above.
- The Google OAuth app and Microsoft app registration must allow the exact redirect URI you use locally.
- `/api/mail/ingest` accepts `Authorization: Bearer $MAIL_INGEST_SECRET` or `Authorization: Bearer $CRON_SECRET`; local development without either secret remains open for smoke testing.
- `GOOGLE_GMAIL_PUBSUB_TOPIC` is optional. When set, Rialto calls Gmail `watch` after a Google mailbox connects and refreshes the watch during mailbox ingestion.
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

1. Run `npm run db:migrate`.
2. Run `node scripts/seed.js`.
3. Start the app with `npm run dev`.
4. Open `/login` and sign in as a contractor.
5. Connect a Gmail or Microsoft 365 mailbox in contractor settings.
6. Create an RFQ with off-platform invite emails.
7. Confirm each recipient gets the PDF plus a unique magic-form link from the connected exact sender address.
8. Submit or update a quote from the magic link.
9. Confirm the contractor quote comparison page shows coverage, sourceable quantity, lead time, and lowest complete comparable quote state.
10. Reply from the vendor mailbox on the same thread with plain text, PDF, or CSV quote content.
11. Wait for `/api/mail/ingest` cron or Gmail push notification delivery, then confirm the reply appears in the RFQ detail page and updates the bid dashboard without a contractor-initiated sync.

## Seeded Email Demo Data

The seed script includes a demo mailbox thread for RFQ `rfq-s001-b`:

- one off-platform vendor request row for `bids@nucor.com`
- one outbound mailbox-origin RFQ message
- one inbound quote reply on the same thread
- one parsed quote response with line items
- one open review task
- one projected quote response with `source = 'email'`

This gives the contractor quote request page enough data to verify the mailbox panel and compare-only email quote state without a live mailbox connection.

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
