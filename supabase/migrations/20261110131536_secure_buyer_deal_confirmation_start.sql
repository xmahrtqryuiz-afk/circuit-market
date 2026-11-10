-- Only a buyer may start a confirmed-deal workflow for an active public listing
-- from a business-verified store. Prevent self-deals and empty pending deal rows.

drop policy if exists "Buyers start deal confirmations" on public.deal_confirmations;

create policy "Buyers start deal confirmations"
on public.deal_confirmations
for insert
to authenticated
with check (
  buyer_id = (select auth.uid())
  and buyer_confirmed_at is not null
  and deal_status = 'pending'
  and seller_confirmed_at is null
  and exists (
    select 1
    from public.listings l
    join public.seller_stores s on s.id = l.seller_store_id
    where l.id = deal_confirmations.listing_id
      and l.seller_store_id = deal_confirmations.store_id
      and l.is_active = true
      and l.moderation_status = 'approved'
      and s.verification_status = 'verified'
      and s.owner_id <> (select auth.uid())
  )
);
