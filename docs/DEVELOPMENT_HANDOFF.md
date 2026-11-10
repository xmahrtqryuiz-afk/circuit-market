# EZPREZZ Development Handoff

Last reviewed: 2026-11-10

## Purpose

This is the existing EZPREZZ application. All work extends this repository and its existing Supabase project. Do not create a replacement app, second database, duplicate authentication system, mock catalogue data, or alternate business rules.

## Canonical resources

- Git repository: `xmahrtqryuiz-afk/circuit-market`
- Production branch: `main`
- Current isolated working branch: `obi/ezprezz-ui-refresh` (existing branch; do not create additional branches)
- Supabase project ref: `qeebnqbzfxinawehwmzc`
- Expected Vercel project: `express`; the EXPRESS team currently returns no linked projects or deployments through the connected Vercel account, so project ownership/access must be reconciled.
- Brand config: `config/brand.ts`

The working branch is a development workspace for the same app, not a second application. Changes must ultimately be reviewed as part of the canonical `main` application. No production merge or release without CEO approval.

## Application structure

- `app/page.tsx`: client-side marketplace shell, public catalogue, PriceCheck and tab navigation.
- `app/layout.tsx`: shared document layout and metadata.
- `app/globals.css`: visual system and responsive styles.
- `components/AccountAccess.tsx`: email sign-up, sign-in and sign-out.
- `components/SellerWorkspace.tsx`: seller store onboarding, private contact settings, listing submission, inventory status and product requests.
- `components/PriceContribution.tsx`: signed-in price observation submission and contributor history.
- `components/AdminDashboard.tsx`: protected moderation dashboard.\n- `components/MarketplaceActivity.tsx`: buyer/seller deal confirmations, verified-deal reviews and product compatibility submissions.
- `config/brand.ts`: customer-facing brand identity and theme values.
- `lib/supabase.ts`: browser Supabase client using the existing project URL and public publishable/anon key.

Do not replace the Supabase client or project configuration as part of a visual redesign.

## Implemented frontend capabilities

### Public marketplace

- Reads active categories, approved active listings, active products, verified public store names/locations and published PriceCheck snapshots.
- Supports search, category filtering, listing detail and empty/loading/error states.
- Seller asking prices remain distinct from reviewed PriceCheck market ranges.
- Buyer phone/WhatsApp contact is returned only by the protected contact-unlock Edge Function.

### Accounts and seller workflows

- Email/password sign-up, sign-in and sign-out are connected to the existing Supabase Auth tenant.
- Authenticated sellers can register a store, update its public profile and save phone/WhatsApp values in the private `seller_store_contacts` table.
- Sellers can submit listings for review against active catalogue products, with up to five JPG/PNG/WebP photos (5 MB each) uploaded to the existing listing-images bucket.
- Sellers can edit listing details, deactivate their own listings, preview their listing photos, add photos to existing listings, reorder photos they uploaded, remove their own photos and filter inventory by active/review status; the database trigger retains existing price-flag and moderation checks.
- Sellers can view listing status and recent product request statuses.
- Sellers can request missing catalogue products; requests remain pending until the existing admin process accepts or rejects them.
- Sellers can submit business verification documents to the existing private verification-documents bucket; only authorised reviewers receive short-lived signed review links.
- Email/phone account confirmation records the account verification level but does not approve the seller's business. Stores remain pending until an authorised administrator approves business evidence.
- If a business verification submission is rejected, the seller can submit fresh evidence; the store returns to the pending moderation queue.

### PriceCheck

- Public visitors see published snapshots only.
- Signed-in contributors can submit a price observation with product, variant, condition, amount, location, source details and optional public evidence URL.
- Contributors can attach a private JPG/PNG/WebP/PDF evidence file (10 MB maximum) or an optional public evidence URL.
- Contributors can see their own recent submissions and review status.
- New observations are inserted as pending and do not automatically change published ranges. Private evidence is served to authorised reviewers through short-lived signed URLs.

## Backend foundation and real data status

- The live Supabase migration ledger contains 24 applied migrations. Only one of the 17 historical migration source files is present in the working branch; seven incremental Phase 1 repair migrations are present and applied. See `docs/PHASE1_MIGRATION_RECONCILIATION.md`.
- RLS is enabled on all audited public tables.
- Nine Edge Functions are active with JWT verification enabled; all deployed function sources were checked against the working branch.
- Marketplace activity now loads compatibility candidates from the active catalogue, verifies that seller deal confirmation actually updates an eligible row, and clears its loading state when deal retrieval fails.
- Security and health advisors report no findings. Performance advisor reports informational unused-index notices; no indexes were removed.
- Business verification is required before a store is considered verified for public listings, seller contact unlock, or buyer deal confirmation. Rejected sellers can re-enter review by submitting new business evidence.
- Buyer deal-confirmation RLS now permits only a buyer (not the store owner) to confirm an active, approved listing from a business-verified store, and requires the buyer confirmation timestamp.
- The first administrator role has not been assigned. The live project has no auth users or `admin_user_roles` assignments at the latest verified check. Do not invent an account identity or create a public bootstrap path.
- Do not insert invented products, listings, seller identities, observations or prices to make screens look populated.

## Remaining frontend and integration work

- Broader catalogue search for compatibility suggestions; the current selector uses products represented by active public listings.
- Product request status/history polish for the requester.
- Admin dashboard real-session testing and secure first-admin bootstrap.
- Buyer, seller, contributor and administrator end-to-end testing with real sessions.
- Responsive and accessibility QA across the full marketplace workflows.

## Design integration contract

Design work should refine the implemented workflows rather than create a second product. Cover:
1. Public home, search, category browse, listing cards/details, and empty/loading/error states.
2. Account access, signed-in state, and contact-unlock confirmation/results.
3. Seller onboarding, verification status, store profile, listing create/edit, image management and inventory states.
4. PriceCheck contribution, evidence, submission confirmation and review status.
5. Admin dashboard, moderation queues, decisions and role-restricted states.
6. Listing reports, compatibility suggestions, mutual deal confirmations and verified-deal reviews.

All screens must be mobile-first and responsive. Reuse the EZPREZZ brand configuration and existing visual tokens unless a formally approved brand update is supplied.

## Non-negotiable implementation constraints

- Keep one repository, one application, one Vercel project, one Supabase project, one database and one authentication tenant.
- Do not create more branches unless there is a specific safety or release reason; use the existing working branch for isolated changes.
- Preserve existing schema, RLS, storage privacy, Edge Functions and moderation behavior.
- Never expose Supabase service-role or secret keys in browser code or `NEXT_PUBLIC_*` variables.
- Never read seller phone/WhatsApp fields directly from public client queries.
- Do not bypass the contact-unlock or administrative review functions.
- Do not seed fake catalogue, seller, listing or PriceCheck records.
- Prefer focused component/service changes over replacing the application.
- No merge to `main` or production release without explicit CEO approval.

## Verification and release gates

- The Next.js production build and Edge Function type checks passed in the last recorded Phase 1 CI run. The newest commits still need a fresh CI result. The latest commit has a failing Vercel status check, but its target deployment returns 404 and the connected Vercel account lists only the EXPRESS team with zero linked projects or deployments. The failure cannot be diagnosed until the existing project is visible to the connected account.
- Rollback-safe SQL regression tests cover atomic marketplace operations, seller listing moderation, PriceCheck evidence, seller verification submission, business verification gating/resubmission, buyer deal-confirmation access control, and the reports/compatibility/deal/review contributor lifecycle, public approved-only compatibility visibility, and seller listing-image reorder/delete permissions. The newest contributor workflow test passed inside a transaction, and a follow-up query confirmed zero remaining synthetic users, stores, products, deals, reports, compatibility rows or reviews.
- A clean development database has not been created because the free route does not provide the required isolated database/branch.
- Vercel preview deployment is not yet verified.
- Phase 1 is not complete until migration history is reproducible from a clean database, latest CI/build is green, real-session buyer/seller/admin workflows pass, Vercel preview is verified, and security/accessibility/release checks pass.
- The CEO must review and explicitly approve any merge to `main` or production release.

## Admin moderation dashboard (development branch)

- The existing Supabase project has an `admin-dashboard` Edge Function with JWT verification enabled.
- It verifies the caller with Supabase Auth, reads the caller's roles from `admin_user_roles` server-side, and returns only queues allowed by those roles.
- Pending queues include stores, listings, PriceCheck observations, product requests, reports and compatibility; each queue is capped at 50 records per request.
- The browser never reads `admin_user_roles` or pending moderation tables directly. Existing RLS restrictions remain unchanged.
- The dashboard UI is permission-aware and includes store verification, listing moderation (including explicit price-flag override confirmation), PriceCheck review, product request acceptance/rejection, user-report triage and product-compatibility review.
- The endpoint excludes private seller phone/WhatsApp data. Pending business verification evidence is exposed only as a five-minute signed URL to an authenticated administrator.
- The frontend uses the existing review Edge Functions for decisions; these retain their own role checks, self-review restrictions and audit logging.
- Business verification approval is disabled until a pending business evidence document is available.
- No administrator roles have been granted. First-admin bootstrap remains a controlled release prerequisite.

- `components/MarketplaceActivity.tsx` now loads compatibility candidates from the active product catalogue, reports seller deal confirmation only after an eligible row is updated, clears the activity loading state after successful reads, and safely clears the confirmation busy state after request failures.
- Live database review confirms 30 public tables with RLS enabled, 54 public RLS policies, and nine public functions. The security-definer moderation/RPC functions are restricted to `service_role` (or `postgres`); no client execution grants were found for the protected functions.
- The current Supabase performance advisor reports 46 informational unused-index notices; no indexes were removed.
- Product request submission persists the database-generated request ID and timestamp in the seller's request tracker rather than using a temporary client-generated identifier.