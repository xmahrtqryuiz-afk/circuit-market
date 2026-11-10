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
| 20261110112813 | phase1_atomic_marketplace_operations | Present; applied 2026-11-10 |
| 20261110113313 | seller_listing_moderation_insert_guard | Present; applied 2026-11-10 |
| 20261110113425 | price_observation_evidence_url_insert_guard | Present; applied 2026-11-10 |
| 20261110131040 | require_business_verification_for_public_sellers | Present; applied 2026-11-10 |
| 20261110131303 | reopen_rejected_store_on_business_resubmission | Present; applied 2026-11-10 |
| 20261110131536 | secure_buyer_deal_confirmation_start | Present; applied 2026-11-10 |
| 20261110160645 | public_compatibility_review_filter_grant | Present; applied 2026-11-10 |

GitHub history was queried for the entire `supabase/migrations` path; it returned no earlier migration commits. The 16 missing historical SQL files cannot be recovered from this repository's history.

## Recovery rules

- Do not delete or rewrite rows in the live migration ledger to make it look tidy.
- Do not invent historical SQL and label it as original.
- Do not apply a guessed historical baseline to the live database.
- Preserve the existing 20261107232813 migration source.
- Reconstruct a clearly labelled baseline/recovery sequence from a complete live-schema export, then validate it against a clean development database before treating the history as reproducible.
- The seven incremental Phase 1 repair migrations are `20261110112813_phase1_atomic_marketplace_operations.sql`, `20261110113313_seller_listing_moderation_insert_guard.sql`, `20261110113425_price_observation_evidence_url_insert_guard.sql`, `20261110131040_require_business_verification_for_public_sellers.sql`, `20261110131303_reopen_rejected_store_on_business_resubmission.sql`, `20261110131536_secure_buyer_deal_confirmation_start.sql`, and `20261110160645_public_compatibility_review_filter_grant.sql`. They are intentionally separate from historical recovery work.

## Current validation state

- Live ledger contains 24 applied migrations: 17 historical records plus seven incremental Phase 1 repairs.
- Working branch contains one historical migration source plus all seven incremental Phase 1 repair migrations.
- No historical migration rows have been modified.
- The atomic marketplace operations, seller listing, PriceCheck evidence, seller verification, business-verification gate, rejected-store resubmission, and buyer deal-confirmation RLS regression tests have been run inside transactions and rolled back; synthetic fixtures were confirmed absent afterward.
- The business-verification gate test confirms email- or phone-confirmed accounts remain pending and cannot pass the public verified-store gate without business review.
- The resubmission test confirms a rejected store returns to the pending review queue when its owner submits fresh pending business evidence, and prior review metadata is cleared.
- The deal-confirmation test confirms only a buyer (not the store owner) can confirm an active, approved listing from a business-verified store, and empty or ineligible deal rows are rejected.
- All eight dependent Edge Functions were redeployed; all nine deployed functions are active with JWT verification enabled and deployed sources match the working branch.
- Supabase security and health advisors report no findings. Performance advisor currently reports 46 informational unused-index notices; no indexes were removed.
- A separate clean development database has not been created. Supabase branching required paid-plan access, and creating a second project requested cost confirmation; neither was used for this free-route validation.
- Rollback-safe tests are preserved at `supabase/tests/phase1_atomic_marketplace_operations.test.sql`, `supabase/tests/seller_listing_moderation_policy.test.sql`, `supabase/tests/price_observation_evidence_policy.test.sql`, `supabase/tests/seller_verification_submission_policy.test.sql`, `supabase/tests/business_verification_gate.test.sql`, `supabase/tests/business_verification_resubmission.test.sql`, `supabase/tests/deal_confirmation_policy.test.sql`, `supabase/tests/marketplace_contributor_workflows.test.sql`, and `supabase/tests/product_compatibility_public_visibility.test.sql`, and `supabase/tests/seller_listing_image_management.test.sql`. They cover atomic moderation, contact throttling, seller listing review enforcement, safe PriceCheck evidence submissions, seller verification evidence submission, the business verification approval/resubmission lifecycle, buyer deal-confirmation access control, seller product-request identity enforcement, the full report/compatibility/deal/review workflow, anonymous visibility of approved compatibility evidence only, and seller-only listing-image upload, ordering and deletion.
