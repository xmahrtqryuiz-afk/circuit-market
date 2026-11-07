# EZPREZZ Development Handoff

Last reviewed: 2026-11-07

## Purpose

This is the existing EZPREZZ application. All work extends this repository and its existing Supabase project. Do not create a replacement app, second database, duplicate authentication system, mock catalogue data, or alternate business rules.

## Canonical resources

- Git repository: `xmahrtqryuiz-afk/circuit-market`
- Production branch: `main`
- Current isolated working branch: `obi/ezprezz-ui-refresh` (existing branch; do not create additional branches)
- Supabase project ref: `qeebnqbzfxinawehwmzc`
- Vercel project: existing `express` project
- Brand config: `config/brand.ts`

The working branch is a development workspace for the same app, not a second application. Changes must ultimately be reviewed as part of the canonical `main` application. No production merge or release without CEO approval.

## Application structure

- `app/page.tsx`: client-side marketplace shell, public catalogue, PriceCheck and tab navigation.
- `app/layout.tsx`: shared document layout and metadata.
- `app/globals.css`: visual system and responsive styles.
- `components/AccountAccess.tsx`: email sign-up, sign-in and sign-out.
- `components/SellerWorkspace.tsx`: seller store onboarding, private contact settings, listing submission, inventory status and product requests.
- `components/PriceContribution.tsx`: signed-in price observation submission and contributor history.
- `config/brand.ts`: customer-facing brand identity and theme values.
- `lib/supabase.ts`: browser Supabase client using the existing project URL and public publishable/anon key.

Do not replace the Supabase client or project configuration as part of a visual redesign.

## Implemented frontend capabilities

### Public marketplace
- Reads active categories, approved active listings, active products, verified public store names/locations and published PriceCheck snapshots.
- Supports search, category filtering, listing detail and empty/loading/error states.
- Seller asking prices remain distinct from reviewed PriceCheck market ranges.

### Accounts and buyer contact
- Email/password sign-up, sign-in and sign-out are connected to the existing Supabase Auth tenant.
- Listing details offer phone and WhatsApp contact unlock through the deployed `unlock-seller-contact` Edge Function.
- The browser never queries the private seller contact table for public buyer contact.
- Contact unlock still depends on the existing JWT, verified-store, approved-listing and rate-limit checks.

### Seller workspace
- Authenticated sellers can register a store, update its public profile and save phone/WhatsApp values in the private `seller_store_contacts` table.
- Sellers can submit listings for review against active catalogue products.
- Sellers can view their listing status.
- Sellers can request missing catalogue products; requests remain pending until the existing admin process accepts or rejects them.
- Listings are not represented as public/approved merely because the seller submitted them.

### PriceCheck
- Public visitors see published snapshots only.
- Signed-in contributors can submit a price observation with product, variant, condition, amount, location, source details and optional public evidence URL.
- Contributors can see their own recent submissions and review status.
- New observations are inserted as pending and do not automatically change published ranges.

## Backend foundation and real data status

The existing Supabase project has 14 deployed migrations, RLS enabled on public tables, and active Edge Functions for contact unlock and administrative review/moderation.

At the latest audit, core catalogue and marketplace tables were empty: `products`, `listings`, `seller_stores`, `profiles`, `listing_images`, `price_observations`, and `price_range_snapshots`. Empty states are therefore expected. Never insert invented products, listings, seller identities, observations or prices to make screens look populated.

## Remaining frontend and integration work

- Listing image upload, image ordering and removal using the existing storage bucket and policies.
- Seller listing edit/deactivate flows and stronger inventory filtering.
- Private evidence file upload for PriceCheck; current form supports source details and an optional public evidence link only.
- Product request status/history for the requester.
- Admin dashboard and role-gated review queues for stores, listings, product requests, price observations, reports and compatibility.
- Secure first-admin bootstrap. The first `super_admin` role has not been assigned; never expose service-role credentials or create a public bootstrap path.
- End-to-end testing with real buyer, seller and administrator sessions.

## Design integration contract

Design work should refine the implemented workflows rather than create a second product. Cover:
1. Public home, search, category browse, listing cards/details, and empty/loading/error states.
2. Account access, signed-in state, and contact-unlock confirmation/results.
3. Seller onboarding, verification status, store profile, listing create/edit, image management and inventory states.
4. PriceCheck contribution, evidence, submission confirmation and review status.
5. Admin dashboard, moderation queues, decisions and role-restricted states.

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

The current work has been committed to the existing working branch and verified by re-reading the changed GitHub files. A local dependency install/build and end-to-end tests have not yet been run; Vercel preview access remains unverified. Do not describe the frontend as production-ready until:
1. TypeScript/build and lint checks pass.
2. Buyer, seller and contributor flows pass with real sessions.
3. RLS and private contact/evidence boundaries are verified.
4. Admin workflows and first-admin bootstrap are tested securely.
5. Responsive and accessibility QA is complete.
6. The CEO reviews and explicitly approves release.

## Admin moderation dashboard (development branch)

- The existing Supabase project now has an `admin-dashboard` Edge Function with JWT verification enabled.
- It verifies the caller with Supabase Auth, reads the caller's roles from `admin_user_roles` server-side, and returns only queues allowed by those roles.
- Pending queues include stores, listings, PriceCheck observations and product requests; each queue is capped at 50 records per request.
- The browser never reads `admin_user_roles` or pending moderation tables directly. Existing RLS restrictions remain unchanged.
- The endpoint excludes private seller phone/WhatsApp data. Pending business verification evidence is exposed only as a five-minute signed URL to an authenticated administrator.
- The frontend uses the existing review Edge Functions for decisions; these retain their own role checks, self-review restrictions and audit logging.
- Business verification approval is disabled until a pending business evidence document is available.
- Admin UI and endpoint are in the existing working branch. The Edge Function has been deployed to the existing Supabase project (version 2).

Admin dashboard build and real administrator-session testing are still outstanding. No administrator roles have been granted as part of this work.
