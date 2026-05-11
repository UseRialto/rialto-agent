# `califsheetmetalbrian_features` Feature Summary

## Status

This branch now has the major procurement workflow surfaces wired into the app. The product routes, request authoring entry points, decision controls, and negotiation loop described below should be treated as the live verification targets for this branch.

## Release Theme

This branch turns the current RFQ workflow into a broader procurement-foundation release. The app now supports both exact-material quoting and more consultative sourcing flows, while also adding public-marketplace anonymity, procurement requirement matching, richer bid evaluation, lightweight negotiation, remainder-request generation, and order follow-up tracking.

The overall goal of the branch is to move the product from a narrow "quote known materials" workflow toward a more complete contractor-to-vendor procurement workflow that can handle uncertainty, compliance signals, partial fulfillment, and more realistic buying decisions.

## Features Added

### 1. Request authoring now supports distinct RFQ and RFP entry points

The contractor project pages now expose separate creation routes:

- `RFQ` for exact-material pricing requests
- `RFP` for consultative, materials-only sourcing packages where the buyer needs recommendations on system, material, alternates, or spec

The RFQ flow remains the exact-pricing path. The new RFP route exposes a materials procurement brief with fields for:

- procurement objective
- scope / package summary
- desired outcome
- performance requirements
- approved alternates requested
- quantity / budget context
- delivery ZIP and logistics
- delivery window and phased delivery needs
- submittals / documentation required
- lead-time sensitivity
- exclusions / unknowns
- vendor questions requested
- attachment / spec reference summary

### 2. AI Spec Assistant is surfaced directly in request authoring

An AI-assisted spec clarification path is available directly in request creation. In the dedicated RFP flow it appears as a first-class section near the top of authoring, and in the RFQ flow it remains available before line item finalization. The contractor can use an `AI Spec Assistant` panel to provide:

- request type
- project/category context
- line items
- pasted plan or spec text
- a plain-English PM question

The assistant can generate:

- a concise summary of the drawings/spec context
- a missing-information checklist
- suggested vendor questions
- suggested spec/material fields to capture
- optional draft intro text for an RFP-style request

These outputs are persisted on the request and remain editable. The implementation keeps AI in an assistive role rather than treating generated content as authoritative.

### 3. Line items were expanded for spec-heavy procurement

Request items now support contextual structured attributes instead of always rendering the same generic field set. The original freeform spec text remains available, but structured spec fields now adapt to the likely material family so contractors see more relevant capture for:

- steel and rebar
- concrete and masonry
- lumber / timber
- glazing
- MEP material
- roofing
- cladding / panels

Units were also expanded and grouped more clearly across weight, count, length, area, volume, and packaging.

### 4. Public marketplace anonymity is now treated as product behavior, not a toggle

Public marketplace requests now explain that buyer identity is hidden and only ZIP-level location context is shown for freight estimating. Contractor-side screens still retain the full company identity, and invited or mailbox-connected communication still uses the contractor’s real connected sender identity.

### 5. Procurement requirements and vendor qualification signals were added

The request model now supports procurement requirement tagging, and vendor-related data was extended to carry qualification and trust context. The implementation includes support for requirement categories such as:

- supplier/diversity-related tags
- domestic sourcing signals
- labor/workforce requirement tags
- qualification notes and trust indicators

The codebase also introduces procurement configuration and type definitions that separate verification concepts from plain self-reporting, which is important for future compliance-aware workflows.

### 6. Bid submission was expanded beyond price-only quoting

Vendor bid flows were upgraded across both platform submission and magic-link submission. Bids can now carry more real procurement context, including:

- compliance declarations
- recommendation/substitution-style notes
- broader bid metadata used for procurement evaluation

The line-item bid flow also now supports partial behavior, making the quoting experience more practical when a vendor cannot fully cover the request.

### 7. Contractor comparison now supports richer decision-making

The contractor bid dashboard is no longer limited to basic price comparison. It now supports:

- fulfillment completeness indicators
- partial-coverage visibility
- compliance declaration display
- buyer decision statuses such as `preferred`, `alternate`, `hold`, and `do_not_use`
- decision rationale capture and persistence
- negotiation activity visibility

This gives buyers a more procurement-oriented comparison surface, where vendor choice can reflect risk, fit, and coverage rather than only lowest cost.

### 8. Partial fulfillment and remainder-request creation were added

Vendors can now quote partial scope, and the contractor-side experience reflects those fulfillment gaps. When a request is only partially covered, the contractor can create a remainder draft from uncovered quantities or items.

This helps buyers continue procurement without manually rebuilding the leftover scope from scratch, while preserving traceability back to the original request.

### 9. Negotiation now bridges mailbox threads and platform replies

The branch introduces negotiation messages tied to requests and bids. Both contractor-side and vendor-side experiences surface threaded discussion so the parties can exchange clarifications on:

- substitutions or recommendations
- terms questions
- lead-time concerns
- scope clarification

Contractor notes now send through the connected mailbox and are intended to stay in the original RFQ email thread when thread metadata is available. Vendors are directed back into Rialto to reply so the negotiation stays tied to the request and bid context on-platform.

### 10. Order follow-up tracking was added to the PO flow

The order experience now includes a lightweight follow-up or "tickle" layer. Contractor order views were updated to support follow-up-oriented tracking so buyers can keep tabs on expected delivery and next-touch timing inside the app.

This extends the procurement workflow beyond award and into active PO management without requiring external reminder systems.

## Data Model and Backend Changes

The branch includes schema, migration, store, action, and type updates to support the new procurement foundation. Based on the current implementation, it adds or extends support for:

- request type and anonymous-public-listing request fields
- richer procurement and qualification type definitions
- compliance declaration persistence on bids
- negotiation message persistence
- contractor and vendor API/type updates for redacted public marketplace behavior
- order follow-up fields and associated contractor UI support

There is also a new migration file:

- `lib/db/migrations/0001_califsheetmetal_procurement_foundation.sql`

That migration reflects the branch’s move toward a broader procurement data model, including new request, bid, vendor, negotiation, and order-related fields.

## User-Facing Impact

From a user perspective, this branch makes the app feel substantially more like a real procurement marketplace instead of a simple RFQ tool:

- PMs can create consultative RFP-style requests instead of only exact RFQs
- AI can help shape unclear specs into buyer-usable request content
- public marketplace requests can protect buyer identity
- vendors can respond more realistically with partial scope and compliance context
- contractors can compare suppliers using more than just price
- buyers can manage alternates, negotiate, and continue sourcing uncovered scope
- awarded work can be tracked with lightweight follow-up fields

## Verification URLs

Use these routes to verify the visible surfaces in the current branch:

- Project dashboard: `/contractor/projects/:projectId`
- RFQ create: `/contractor/projects/:projectId/rfqs/new`
- RFP create: `/contractor/projects/:projectId/rfps/new`
- RFQ / RFP detail and bid dashboard: `/contractor/projects/:projectId/rfqs/:rfqId`
- Vendor RFQ response: `/vendor/rfqs/:rfqId`

## Notes

This branch reads as a procurement-foundation milestone rather than a finished end-state platform. It introduces the major workflow building blocks needed for consultative sourcing, anonymous public publishing, qualification-aware evaluation, partial fulfillment, negotiation, and follow-up, while still leaving room for future expansion such as deeper compliance enforcement, formal revision rounds, and more advanced automation.
