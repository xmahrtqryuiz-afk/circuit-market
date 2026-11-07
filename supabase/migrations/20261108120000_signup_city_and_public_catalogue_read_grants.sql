-- Repair signup profile creation and restore read grants required by existing public RLS policies.
-- RLS remains enabled; grants do not bypass the table policies.

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

grant select on table public.listings, public.seller_stores, public.listing_images
to anon, authenticated;
