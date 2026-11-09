# Phase 1 — Migration history reconciliation

Project: `qeebnqbzfxinawehwmzc`  
Repository branch: `obi/ezprezz-ui-refresh`

## Live migration ledger (verified 2026-11-09)

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

GitHub history was queried for the entire `supabase/migrations` path; it returned no earlier migration commits. The 16 missing SQL files cannot be recovered from this repository's history.

## Recovery rules

- Do not delete or rewrite rows in the live migration ledger to make it look tidy.
- Do not invent historical SQL and label it as original.
- Do not apply a guessed baseline to the live database.
- Preserve the existing 20261107232813 migration source.
- Reconstruct a clearly labelled baseline/recovery sequence from a complete live-schema export, then validate it against a clean Supabase development database before treating the history as reproducible.
- The incremental Phase 1 repair migration is `20261109225200_phase1_atomic_marketplace_operations.sql`. It is intentionally separate from the historical recovery work.

## Current validation state

- Live ledger contains 17 applied migrations.
- Working branch contains one of those 17 original migration files plus the new incremental repair migration.
- No historical migration rows have been modified.
- No production migration has been applied.
- A clean development database has not yet been created or tested.
