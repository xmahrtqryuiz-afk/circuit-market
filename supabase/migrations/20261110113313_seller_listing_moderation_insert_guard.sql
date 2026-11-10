-- Ensure sellers can submit listings for moderation but cannot self-publish.
-- The client supplies moderation_status='review_required'; grant that one insert
-- column while the INSERT policy rejects any seller-supplied approved status.

alter table public.listings
  alter column moderation_status set default 'review_required';

drop policy if exists "Store owners create listings" on public.listings;
create policy "Store owners create listings"
on public.listings
for insert
to authenticated
with check (
  moderation_status = 'review_required'
  and private.owns_store(seller_store_id)
);

grant insert (moderation_status) on public.listings to authenticated;
