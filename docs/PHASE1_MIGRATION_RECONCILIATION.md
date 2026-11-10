# Phase 1 — Migration history reconciliation

Project: `qeebnqbzfxinawehwmzc`  
Repository branch: `obi/ezprezz-ui-refresh`

## Live migration ledger (verified 2026-11-10)

| Version | Name | Source file in working branch |
|---|---|---|
| 20261101184238 | circuitmarket_core_v1 | Missing |
| 20261101184254 | index_price_observation_submitter | Missing |
| 20261102175631 | circuitmarket_geography_catalog_roles_v2 | Missing |
| 20261102175711 | circuitmarket_security_price_storage_v2 | Missing |
| 20261102175751 | circuitmarket_security_advisor_fixes_v2 | Missing |
| 20261102175835 | circuitmarket_price_engine_detection_v2 | Missing |
| 20261102175929 | circuitmarket_seed_nigeria_lgas_v1 | Missing |
| 20261102175945 | circuitmarket_review_trigger_index_fixes_v1 | Missing |
| 20261102180024 | circuitmarket_reviews_contributors_price_mean_v1 | Missing |
| 20261102180048 | circuitmarket_subscription_and_review_indexes_v1 | Missing |
| 20261102180205 | circuitmarket_listing_privacy_hardening_v1 | Missing |
| 20261102180222 | circuitmarket_verification_evidence_and_moderation_override_v1 | Missing |
| 20261102180230 | circuitmarket_listing_review_override_fix_v1 | Missing |
| 20261102180309 | circuitmarket_verification_evidence_path_policy_v1 | Missing |
| 20261107232813 | signup_city_and_least_privilege_catalogue_reads | Present |
| 20261108073723 | claude_write_test | Missing |
| 20261108073730 | claude_write_test_cleanup | Missing |
| 20261110112813 | phase1_atomic_marketplace_operations | Present; applied 2026-11-10 |\n| 20261110113313 | seller_listing_moderation_insert_guard | Present; applied 2026-11-10 |\n| 20261110113425 | price_observation_evidence_url_insert_guard | Present; applied 2026-11-10 |

GitHub history was queried for the entire `supabase/migrations` path; it returned no earlier migration commits. The 16 missing historical SQL files cannot be recovered from this repository's history.

## Recovery rules

- Do not delete or rewrite rows in the live migration ledger to make it look tidy.
- Do not invent historical SQL and label it as original.
- Do not apply a guessed historical baseline to the live database.
- Preserve the existing 20261107232813 migration source.
- Reconstruct a clearly labelled baseline/recovery sequence from a complete live-schema export, then validate it against a clean development database before treating the history as reproducible.
- The incremental Phase 1 repair migrations are `20261110112813_phase1_atomic_marketplace_operations.sql`, `20261110113313_seller_listing_moderation_insert_guard.sql`, and `20261110113425_price_observation_evidence_url_insert_guard.sql`. They are intentionally separate from historical recovery work.

## Current validation state

- Live ledger contains 20 applied migrations: 17 historical records plus three incremental Phase 1 repairs.
- Working branch contains one historical migration source plus all three incremental Phase 1 repair migrations.
- No historical migration rows have been modified.
- The incremental repair migration was first executed inside a transaction and rolled back; a synthetic integration smoke test exercised the critical write paths and security restrictions without retaining fixture data.
- The incremental repair migration was subsequently applied and recorded in the live ledger.
- All eight dependent Edge Functions were redeployed; all nine deployed functions are active with JWT verification enabled.
- Supabase security and health advisors report no findings.
- A separate clean development database has not been created. Supabase branching required paid-plan access, and creating a second project requested cost confirmation; neither was used for this free-route validation.
- Rollback-safe tests are preserved at `supabase/tests/phase1_atomic_marketplace_operations.test.sql`, `supabase/tests/seller_listing_moderation_policy.test.sql`, `supabase/tests/price_observation_evidence_policy.test.sql`, and `supabase/tests/seller_verification_submission_policy.test.sql`. They cover atomic moderation, contact throttling, seller listing review enforcement, safe PriceCheck evidence submissions, and seller verification evidence submission. The seller and PriceCheck UI payloads now rely on database-controlled pending defaults instead of attempting to set protected review-state columns.
