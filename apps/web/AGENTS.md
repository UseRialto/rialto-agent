<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Rialto Agent Notes

## App Scope

This directory is the active app. Run commands from `apps/web`.

```bash
npm run dev
npm run build
npm run typecheck
npm run db:generate
npm run db:migrate
node scripts/seed.js
```

## Stack

- Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS.
- Neon Postgres through Drizzle ORM and `@neondatabase/serverless`.
- JWT auth in the `insiteai_session` httpOnly cookie.
- Server-only persistence: do not import `lib/db` or `lib/store` into client components.

## Core Flows

- Contractor creates Quote Request: `app/contractor/projects/[projectId]/rfqs/new/_components/RFQWizard.tsx`.
- Items step: `StepItems.tsx`. CSV line items import into item cards. Reference files are uploaded from the AI Spec Assistant panel and saved in `attachment_urls`. Item-card fields and the AI Spec Assistant are customizable from the wizard settings control in `RFQWizard.tsx`; settings are persisted in localStorage.
- Invite step: `StepInviteVendors.tsx`. Vendor search/invites live here. AI vendor outreach draft calls `/api/generate-email-draft`.
- Review step: `StepReview.tsx`. Saves drafts and publishes requests. Email subject/body editing is intentionally not present on Review; the page shows a compact email summary, secure quote-form preview, and PDF preview. Do not re-add expanded specs/constraints or full email-body rendering here.
- Draft quote requests should reopen the creation wizard using `?rfqId=...&step=review`, not the comparison page.
- Contractor comparison page: `app/contractor/projects/[projectId]/rfqs/[rfqId]/_components/`.
- Off-platform magic quote form: `app/vendor/magic-rfq/[token]/_components/MagicRFQFormClient.tsx`.
- Vendor RFQ submission captures `designer_name`; platform submissions allow it, magic-link submissions require it. Contractor vendor summary displays Designer by default.

## AI

AI request authoring lives in `lib/ai/request-authoring.ts`.

- Quote Comparison agent editing uses the single Rialto Agent OpenAI core and requires `OPENAI_API_KEY`; do not add deterministic spreadsheet-edit fallbacks.
- Optional selector: `OPENAI_MODEL` defaults to `gpt-5-mini`.
- Vendor outreach email generation can fall back to a deterministic template if no LLM key is configured.

## Product Modules

- Requesting Quotes: quote request authoring, Bill of Materials setup, vendor invites, outbound drafts, and explicit sends.
- Vendor Response Intake: magic-form responses, mailbox replies, file extraction, external quote import, provenance, and review issues.
- Quote Comparison: workbook evaluation, complete/partial quote distinction, spreadsheet view state, and visible agent sheet patches.

## Quote Comparison Rules

- Lowest quote badges must only consider complete comparable quotes.
- Partial quotes must clearly show missing/no-bid lines, sourced quantity versus requested quantity, and review caveats.
- Magic-link bid totals are calculated from `unit_price * units_available` when available, otherwise `unit_price * quoted_quantity`.
- Email-origin quotes are compare-only and cannot create award, PO, purchasing handoff, or order tracking workflows in v1.
- `BidVendorSummaryTable` has customizable draggable columns; default visible columns are Vendor, Designer, Total Price, Lead Time, Coverage, and Payment Terms.
- `BidSkuTable` is an Excel-style matrix. It supports vendors-as-rows or items-as-rows, row/column drag sequencing, first-column resizing, and metric sorting by total, unit, or lead time.
- `BidPriceChart` is a ranking table with separate Price Ranking and Lead Time Ranking buttons; vendor names should open the same vendor detail drawer used elsewhere.
- `BidDashboard` must remain a Quote Comparison surface. Do not add award, PO, or tracking-order actions here.
- Expanded line items, expenditure breakdown, and vendor comparison summary are not default bid dashboard sections.

## Mailbox and Magic Links

- Mailbox OAuth is connect-only from contractor settings. It is not login.
- Gmail and Microsoft sends use `lib/mail/service.ts`.
- Off-platform invite sends create unique magic links in `rfq_magic_links`; schema enforces unique token hashes and one link per vendor request.
