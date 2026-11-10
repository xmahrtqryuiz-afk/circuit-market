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

The branch contains substantial application and integration work beyond the design layer. At the latest comparison in this review it is ahead of `main` and not behind. The development branch must not be treated as a visual-only prototype. Review changes carefully and coordinate before editing overlapping files.

## Design work just applied

File: `app/globals.css`

Commit: `65b12956d38437cace75d70ef66651dc34e3b125`

- Added consistent disabled-control affordances.
- Added visible focus treatment for product and category cards.
- Raised mobile account, seller-contact, admin moderation and inventory action controls to a 44px minimum target.
- Raised mobile form controls to a 44px minimum height with readable input sizing.
- Improved horizontal admin filter scrolling on small screens.

No React logic, database queries, Supabase configuration, RLS, Edge Functions, authentication or business rules were changed.

## Additional design pass

File: `app/globals.css`

Commit: `af6ebe3777edf0ce23aa3f8c84d672ba938173fa`

- Improved product discovery card consistency, image framing and product-name hierarchy.
- Applied tabular numerals to seller asking prices for easier scanning.
- Refined PriceCheck range cards with a restrained accent, clearer product/evidence metadata and stronger range/median hierarchy.
- Adjusted the PriceCheck range layout for narrow mobile screens.

This is CSS-only. It does not alter product data, price calculations, published-range eligibility, queries, or any backend contract.

## Review update — 2026-11-08

The latest inspected branch head before this design pass was `08227d578f557c90e76db635fd83cf2ceb2a00bb`, 50 commits ahead of `main` and 0 behind. The branch now also contains technical follow-up commits covering catalogue error messaging, moderation queue queries, signup/profile handling, least-privilege catalogue grants, and migration filename cleanup. These changes are outside the design scope and should receive Chika's technical validation.

No open pull request, submitted PR review, inline review thread, or repository issue containing Chika's design review feedback was found during this check. Commit history shows technical follow-up work, but it does not substitute for an explicit review of the CSS/UI changes.

### Additional discovery-card improvement

Files: `app/page.tsx`, `app/globals.css`

- Added a condition badge to each public product card, using the listing's existing `item_condition` value already mapped into the product view.
- Styled the badge within the existing EZPREZZ green palette.
- No catalogue records, product values, filtering, pricing, authentication, or backend contracts were changed.

Commits:
- `353e6e4261be6b9f43b190fb373945d8a5100052`
- `66632478c51b680dc8afcd6614b2099c067a33c8`

### Current review gaps

- Chika's explicit CSS/component review is still pending.
- Build, lint, responsive browser QA, and real-session interaction checks remain unverified.
- Product cards still need a later pass for stronger brand/model/specification hierarchy where the existing catalogue fields support it.
- PriceCheck currently exposes condition, geographic level and reviewed-observation count, but its evidence context can be made easier to compare; retain the current published-snapshot-only rule and do not invent sample data.

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
