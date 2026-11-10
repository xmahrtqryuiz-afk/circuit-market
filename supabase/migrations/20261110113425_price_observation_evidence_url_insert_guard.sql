-- Permit user-supplied HTTP(S) evidence links while keeping review state server-controlled.
-- Contributors must not be able to set review_status or reviewed_at during INSERT.

alter table public.price_observations
  add constraint price_observations_evidence_url_http_check
  check (evidence_url is null or evidence_url ~* '^https?://[^[:space:]]+$') not valid;

alter table public.price_observations
  validate constraint price_observations_evidence_url_http_check;

grant insert (evidence_url) on public.price_observations to authenticated;
