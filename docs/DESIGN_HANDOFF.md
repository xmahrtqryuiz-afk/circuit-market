# EZPREZZ Design Handoff — Obi to Chika

Date: 2026-11-07

## Scope and working agreement

- Design work is against the existing `xmahrtqryuiz-afk/circuit-market` application, not the Canva website preview.
- Continue on the already-existing `obi/ezprezz-ui-refresh` working branch. Do not create another branch or a replacement app.
- `main` remains the production branch. Do not merge or deploy without explicit CEO approval.
- Chika owns application structure, functionality, integrations, database connections and technical stability. Design changes must preserve those contracts and be reviewed by Chika before release.

## What I recovered from the previous Obi direction

EZPREZZ is a Nigeria-first electronics marketplace with built-in price intelligence, initially focused on Port Harcourt. It is not a fintech app or a generic fashion-led marketplace.

Design principles:
- Make electronics sourcing feel precise, trustworthy and easy to compare.
- Prioritise technical product identity: brand, model, variant/specification, condition and compatibility where applicable.
- Make location and seller trust visible without exposing private seller contact details.
- Keep seller asking prices visually distinct from reviewed/published PriceCheck ranges.
- PriceCheck should communicate evidence quality, observation count, condition and geographic scope; do not imply a range where the evidence threshold is not met.
- Use honest empty, loading and error states. Never add demo products, sellers, reviews or market prices to fill empty screens.
- Mobile-first, with a clear desktop adaptation; maintain accessible contrast, keyboard focus and at least 44px touch targets for mobile controls.

## Existing brand system

Source of truth: `config/brand.ts`.
- Deep green: `#002f22`
- Lime: `#d9ff35`
- Paper: `#f8faf7`
- Brand line: “Find it. Compare it. Buy with confidence.”
- Keep brand changes centralised in the existing config; do not create a second theme source.

## Repository review

The working branch already contains the main workflow components:
- `components/AccountAccess.tsx`: Supabase Auth sign-in/sign-up/sign-out.
- `components/SellerWorkspace.tsx`: store profile, private seller contact settings, listing submission/edit/deactivation, photo uploads and product requests.
- `components/PriceContribution.tsx`: price observation submission, evidence attachment and contributor status.
- `components/AdminDashboard.tsx`: role-aware moderation queues and review actions through existing Edge Functions.
- `app/page.tsx`: public marketplace, search/category filtering, published PriceCheck, account entry, seller workspace, admin entry and secure seller-contact unlock.
- `app/globals.css`: shared visual system and responsive component styling.

The branch is 37 commits ahead of `main` and not behind at the time of review. The development branch includes functional and integration work; it must not be treated as a visual-only prototype. Review changes carefully and coordinate before editing overlapping files.

## Design work just applied

File: `app/globals.css`

Commit: `65b12956d38437cace75d70ef66651dc34e3b125`

- Added consistent disabled-control affordances.
- Added visible focus treatment for product and category cards.
- Raised mobile account, seller-contact, admin moderation and inventory action controls to a 44px minimum target.
- Raised mobile form controls to a 44px minimum height with readable input sizing.
- Improved horizontal admin filter scrolling on small screens.

No React logic, database queries, Supabase configuration, RLS, Edge Functions, authentication or business rules were changed.

## Chika review requested

1. Check the CSS-only commit for selector collisions with current component styles and confirm it does not affect desktop layout.
2. Run the existing TypeScript/build and lint checks when the current development environment is available.
3. Test the mobile account modal, seller contact unlock, seller listing actions and admin moderation controls at 360px and 390px widths.
4. Confirm all secure actions still use the existing Supabase Auth and Edge Function paths.
5. Report any technical constraint before a design change needs component or data-contract work.

## Next design priorities

1. Public discovery: stronger category navigation, clearer search/filter hierarchy and specialist electronics listing cards.
2. Product details: improve image presentation and technical specification hierarchy while retaining the asking-price disclaimer and secure contact unlock.
3. PriceCheck: clearer distinction between published market ranges and individual seller offers; make sample count, condition and geographic scope easy to scan.
4. Seller workspace: clearer staged onboarding, verification status, listing form grouping, image upload feedback and inventory status.
5. Admin: make review queues scannable and actions clear without weakening role restrictions or audit trails.

No merge to `main`, production deployment, schema change, fake data insertion or new project creation is part of this handoff.
