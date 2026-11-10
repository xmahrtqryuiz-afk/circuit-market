-- Verify sellers can submit listings for review but cannot self-publish.
-- Synthetic fixtures are created inside a transaction and always rolled back.

begin;

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'authenticated','authenticated','phase1-listing-policy@example.invalid','',
  '{}'::jsonb,
  '{"display_name":"Listing Policy Probe","city":"Test City"}'::jsonb,
  now(),now()
);

do $setup$
declare
  v_country uuid;
  v_category uuid;
  v_allowed_product uuid;
  v_blocked_product uuid;
  v_store uuid;
begin
  select id into v_country from public.countries limit 1;
  if v_country is null then raise exception 'No country fixture available'; end if;

  insert into public.categories(name,slug)
  values('Listing Policy Probe','listing-policy-'||substr(gen_random_uuid()::text,1,8))
  returning id into v_category;

  insert into public.products(category_id,name,slug)
  values(v_category,'Listing Policy Allowed','listing-policy-'||substr(gen_random_uuid()::text,1,8))
  returning id into v_allowed_product;

  insert into public.products(category_id,name,slug)
  values(v_category,'Listing Policy Blocked','listing-policy-'||substr(gen_random_uuid()::text,1,8))
  returning id into v_blocked_product;

  insert into public.seller_stores(owner_id,store_name,city,country_id)
  values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Listing Policy Store','Test City',v_country)
  returning id into v_store;

  perform set_config('request.jwt.claim.sub','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',true);
  perform set_config('phase1.probe.store',v_store::text,true);
  perform set_config('phase1.probe.product_allowed',v_allowed_product::text,true);
  perform set_config('phase1.probe.product_blocked',v_blocked_product::text,true);
end;
$setup$;

set local role authenticated;

-- The actual seller-workspace insert path must succeed.
insert into public.listings(seller_store_id,product_id,item_condition,asking_price,city,moderation_status)
values(
  current_setting('phase1.probe.store')::uuid,
  current_setting('phase1.probe.product_allowed')::uuid,
  'new',1000,'Test City','review_required'
)
returning moderation_status;

-- A seller must not be able to set approved, even if the store belongs to them.
do $assert$
begin
  begin
    insert into public.listings(seller_store_id,product_id,item_condition,asking_price,city,moderation_status)
    values(
      current_setting('phase1.probe.store')::uuid,
      current_setting('phase1.probe.product_blocked')::uuid,
      'new',1000,'Test City','approved'
    );
    raise exception 'SECURITY FAILURE: seller was able to insert an approved listing';
  exception when insufficient_privilege then
    null;
  end;
end;
$assert$;

reset role;
rollback;
