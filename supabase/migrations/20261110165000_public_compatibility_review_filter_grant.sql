-- The public compatibility policy only exposes approved rows. Grant the
-- moderation-status column needed for anon clients to filter against that RLS policy.
grant select (review_status) on public.product_compatibilities to anon;
