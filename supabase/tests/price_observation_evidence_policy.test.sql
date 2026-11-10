-- Verify a contributor can submit an HTTP(S) evidence link, cannot self-approve,
-- and cannot store a non-HTTP(S) evidence URL. All fixtures are rolled back.

begin;

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  'authenticated','authenticated','phase1-price-probe@example.invalid','',
  '{}'::jsonb,
  '{"display_name":"Price Policy Probe","city":"Test City"}'::jsonb,
  now(),now()
);

do $setup$
declare
  v_category uuid;
  v_product uuid;
begin
  insert into public.categories(name,slug)
  values('Price Policy Probe','price-policy-'||substr(gen_random_uuid()::text,1,8))
  returning id into v_category;

  insert into public.products(category_id,name,slug)
  values(v_category,'Price Policy Product','price-policy-'||substr(gen_random_uuid()::text,1,8))
  returning id into v_product;

  perform set_config('request.jwt.claim.sub','ffffffff-ffff-4fff-8fff-ffffffffffff',true);
  perform set_config('phase1.price.product',v_product::text,true);
end;
$setup$;

set local role authenticated;

insert into public.price_observations(product_id,submitted_by,item_condition,amount_value,city,source_type,source_description,evidence_url,observed_on,currency_code)
values(
  current_setting('phase1.price.product')::uuid,
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  'new',1000,'Test City','shop_quote','Smoke quote','https://example.com/quote',current_date,'NGN'
)
returning review_status;

do $assert$
begin
  begin
    insert into public.price_observations(product_id,submitted_by,item_condition,amount_value,city,source_type,source_description,review_status)
    values(
      current_setting('phase1.price.product')::uuid,
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      'new',1000,'Test City','shop_quote','Attempted self approval','approved'
    );
    raise exception 'SECURITY FAILURE: contributor was able to set approved review status';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.price_observations(product_id,submitted_by,item_condition,amount_value,city,source_type,source_description,evidence_url)
    values(
      current_setting('phase1.price.product')::uuid,
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      'new',1000,'Test City','shop_quote','Unsafe link','javascript:alert(1)'
    );
    raise exception 'SECURITY FAILURE: unsafe evidence URL was accepted';
  exception when check_violation then
    null;
  end;
end;
$assert$;

reset role;
rollback;
