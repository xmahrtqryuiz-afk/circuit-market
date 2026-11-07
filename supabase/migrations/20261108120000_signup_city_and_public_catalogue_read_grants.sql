-- Repair signup profile creation and restore least-privilege catalogue reads.
-- RLS remains enabled; column grants do not bypass the existing row policies.

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles(id, display_name, city)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'display_name', ''),
    nullif(new.raw_user_meta_data->>'city', '')
  )
  on conflict (id) do nothing;

  insert into public.account_roles(user_id, role)
  values (new.id, 'buyer')
  on conflict (user_id, role) do nothing;

  insert into public.contributor_profiles(user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$function$;

grant select (
  id, seller_store_id, product_id, variant_label, item_condition,
  asking_price, quantity, city, area, notes, is_active,
  moderation_status, created_at, currency_code
) on table public.listings to anon, authenticated;

grant select (
  id, owner_id, store_name, description, city, area,
  verification_status, is_open, verification_level
) on table public.seller_stores to anon, authenticated;

grant select (
  listing_id, storage_path, alt_text, sort_order, image_review_status
) on table public.listing_images to anon, authenticated;
