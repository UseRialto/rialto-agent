# Email Integration - Status

## What is merged to main

All email infrastructure from Tomasz's branch and Jack's AI-drafting feature are now on `main`.

### Contractor mailbox connect (OAuth)
- `lib/mail/service.ts` - full Gmail/Outlook send, inbound sync, `attachGoogleMailbox(code, userId, redirectUri)`, `attachMicrosoftMailbox(code, userId, redirectUri)`
- `contractor_mailboxes` DB table (in Drizzle schema) - stores per-user OAuth tokens in Neon
- `/api/auth/google/start` + `/api/auth/google/callback` - Gmail OAuth (mailbox connect, not login)
- `/api/auth/microsoft/start` + `/api/auth/microsoft/callback` - Outlook OAuth (same model)
- Contractor Settings page shows Gmail/Outlook connect cards and connected mailbox status
- **OAuth is settings-only** - never shown on the login page; existing session required to start OAuth flow
- **Redirect URI is self-derived** - computed from `request.url` in the start route, stored in a cookie, threaded into `exchangeOAuthCode`. No `GOOGLE_REDIRECT_URI` env var needed. Works on any domain (local, Vercel, preview).

### AI request authoring
- `/api/ai-spec-assistant` - calls the configured LLM for RFQ/RFP spec and scope guidance
- `/api/generate-email-draft` - calls the configured LLM to generate or refine vendor outreach email
- `StepItems.tsx` - contains the AI Spec Assistant and reference-file upload surface
- `StepInviteVendors.tsx` - auto-generates on mount, `{{vendor_first_name}}` rendered as blue chip, Regenerate + Refine support
- `StepReview.tsx` - chip-rendered preview in "Rendered Email Preview" section
- `rfqs.email_body` + `rfqs.email_subject` columns store the draft; `buildRFQEmailDraft(savedBody)` uses AI body on publish

### Magic link / off-platform vendor flow
- `lib/mail/rfq-email-draft.ts` - `buildMagicFormPreviewUrl()`, template helpers
- `/vendor/magic-rfq/[token]` - off-platform vendor secure quote form
- PDF attachment: `lib/rfq-pdf.ts` + `/api/rfq-pdf/[rfqId]`

### RFQ mailbox panel
- RFQ detail page shows mailbox panel, vendor request state, email activity, review tasks
- Email-origin quotes show `Email` / `Needs Review` labels; unresolved review tasks keep quote comparison caveats visible

### Seed demo email data
- `rfq-s001-b` has a full email demo thread: one `rfq_vendor_requests` row, one outbound + one inbound `rfq_email_messages`, one `rfq_quote_responses` + two `rfq_quote_line_items`, one open `rfq_review_tasks`, and an email-origin bid (`source: 'email'`, `status: 'under_review'`)

---

## What still needs doing

1. **Live Gmail flow test** - requires valid OAuth env vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and `OPENAI_API_KEY` if AI authoring is tested:
   - Connect Google from contractor Settings
   - Send RFQ emails for an RFQ with off-platform invites
   - Reply on the same Gmail thread
   - Run mailbox sync and confirm reply appears in the quote comparison dashboard

2. **Microsoft OAuth live setup** - create a Microsoft Entra app registration, add the local/prod callback URLs, grant delegated Graph permissions (`openid`, `email`, `profile`, `offline_access`, `User.Read`, `Mail.Read`, `Mail.Send`), then set `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` / `MICROSOFT_TENANT_ID`.

3. **MIME / parsing hardening** (likely spots found during live test):
   - `buildMimeMessage` formatting
   - Gmail payload/body parsing
   - quote-line matching thresholds
   - attachment extraction / file URL generation

---

## Required environment variables

```
DATABASE_URL=                # Neon Postgres connection string
JWT_SECRET=                  # session signing (any 32+ char random string)
OPENAI_API_KEY=             # Rialto Agent LLM core
OPENAI_MODEL=               # optional, defaults to gpt-5-mini
GOOGLE_CLIENT_ID=            # Gmail OAuth
GOOGLE_CLIENT_SECRET=        # Gmail OAuth
MICROSOFT_CLIENT_ID=         # Outlook OAuth (optional)
MICROSOFT_CLIENT_SECRET=     # Outlook OAuth (optional)
MICROSOFT_TENANT_ID=common   # Outlook OAuth; use a tenant ID for single-tenant deployments
```

Add to `apps/web/.env.local` for local dev. Add all of the above to Vercel environment variables for production.

### Google Cloud Console setup
- **Authorized redirect URIs**: add your Vercel domain - `https://your-app.vercel.app/api/auth/google/callback`
- **OAuth consent screen → Test users**: add any Google account that should be able to connect their mailbox while the app is in Testing mode
- No `GOOGLE_REDIRECT_URI` env var needed - the app derives it automatically from the request URL

### Microsoft Entra setup
- **Redirect URIs**: add `http://localhost:3000/api/auth/microsoft/callback` for local dev and `https://your-app.vercel.app/api/auth/microsoft/callback` for production.
- **Delegated Graph permissions**: add `openid`, `email`, `profile`, `offline_access`, `User.Read`, `Mail.Read`, and `Mail.Send`.
- **Consent**: grant admin consent if the target tenant does not allow users to consent to mail permissions.
- **Tenant**: leave `MICROSOFT_TENANT_ID=common` for multi-tenant contractor mailbox connect, or use the tenant GUID for a single Microsoft tenant.
