# EZPREZZ Development Handoff

Last reviewed: 2026-11-07

## Purpose

This repository is the existing EZPREZZ application. UI work must extend this codebase and its existing Supabase project. Do not create a replacement app, a second database, mock catalogue data, or alternate business rules.

## Canonical resources

- Git repository: `xmahrtqryuiz-afk/circuit-market`
- Production branch: `main`
- Temporary design branch: `obi/ezprezz-ui-refresh`
- Supabase project ref: `qeebnqbzfxinawehwmzc`
- Vercel project: existing `express` project (do not create another project)
- Brand config: `config/brand.ts`

The design branch is based directly on the current production branch and is currently one commit ahead, with a small CSS-only change in `app/globals.css`.

## Existing application structure

- `app/page.tsx`: current client-side marketplace shell and public catalogue / PriceCheck queries.
- `app/layout.tsx`: shared document layout and metadata.
- `app/globals.css`: current visual system and responsive styles.
- `config/brand.ts`: customer-facing brand identity and theme values.
- `lib/supabase.ts`: browser Supabase client. It uses the existing project URL and prefers `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, retaining `NEXT_PUBLIC_SUPABASE_ANON_KEY` compatibility.

Do not replace the Supabase client or project configuration as part of a visual redesign.

## Existing product behavior

### Public marketplace

The current page reads:
- Active categories from `public.categories`.
- Active listings from `public.listings`.
- Active product records from `public.products`.
- Public store names and locations from `public.seller_stores`.

Listing asking prices must always be labelled as seller asking prices, not verified market prices. Public listing visibility remains governed by the database's existing RLS and moderation rules.

### PriceCheck

The current page reads only published records from `public.price_range_snapshots`. PriceCheck ranges are reviewed evidence outputs and must remain separate from seller asking prices. Do not show pending observations as public ranges.

### Seller contact

The existing `unlock-seller-contact` Edge Function is deployed with JWT verification. Seller contact information is intentionally private and must not be queried directly from public client code. The approved contact-unlock workflow must be used when integrating buyer contact actions.

## Existing backend foundation

The existing Supabase project has 14 migrations, RLS enabled on public tables, and active Edge Functions for seller contact unlock and administrative review/moderation workflows. The current database includes marketplace, seller, price evidence, geography, moderation, review, and subscription entities.

At the time of this review, the following core tables contain no production rows: `products`, `listings`, `seller_stores`, `profiles`, `listing_images`, `price_observations`, and `price_range_snapshots`. Empty states are therefore expected. Never insert invented products, listings, seller identities, or prices to make screens look populated.

## Known frontend gaps (do not disguise as completed)

- Authentication screens and session-aware account navigation are not integrated.
- Seller onboarding and store profile management are not integrated.
- Seller listing creation/editing, image upload, and listing lifecycle are not integrated.
- Buyer contact unlock is not integrated into listing details.
- Price observation submission and evidence upload are not integrated.
- Admin review screens are not integrated.
- The current Sell tab is an explicit placeholder.
- The listing detail modal currently displays details but has no contact action.

## Design integration contract

Design work should supply screens and interaction states for the actual workflows below, while preserving the backend entities and security boundaries:

1. Public home, search, category browse, filters, listing cards, listing detail, empty/loading/error states.
2. Buyer authentication, account/session states, and contact-unlock confirmation/results.
3. Seller onboarding, store profile, verification status, listing create/edit, image upload, draft/pending/approved/rejected states, and inventory management.
4. PriceCheck product/variant/condition selection, observation entry, evidence upload, submission confirmation, and review status.
5. Admin dashboard, seller/listing/price evidence review queues, moderation decisions, and role-restricted states.

All designs must be mobile-first and responsive. Reuse the existing EZPREZZ brand configuration and visual tokens unless a formally approved brand update is supplied.

## Non-negotiable implementation constraints

- Keep the same Git repository, Vercel project, Supabase project, database, and authentication tenant.
- Preserve existing schema, RLS, storage privacy, Edge Functions, and moderation behavior.
- Never expose Supabase service-role or secret keys in browser code or `NEXT_PUBLIC_*` variables.
- Never read seller phone/WhatsApp fields directly from public client queries.
- Do not bypass the seller contact Edge Function or administrative review functions.
- Do not seed fake catalogue, seller, listing, or PriceCheck records.
- Prefer focused component and service changes over replacing the entire application page.
- Keep design work on the temporary branch until reviewed.
- No merge to `main` and no production deployment without explicit CEO approval.

## Development completion gates before production

1. Session-aware authentication and role handling.
2. Seller onboarding, verification, listing CRUD, and private image upload.
3. Buyer contact unlock through the existing Edge Function.
4. PriceCheck evidence submission, private evidence storage, review, and publication flow.
5. Admin moderation and first-admin bootstrap using a secure, non-public process.
6. End-to-end tests for buyer, seller, and admin roles, including RLS and privacy checks.
7. Responsive, accessibility, loading, empty, error, and success-state QA.
8. Production release only after CEO review and explicit approval.
