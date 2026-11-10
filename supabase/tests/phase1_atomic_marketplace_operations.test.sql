-- Phase 1 atomic marketplace operations integration smoke test.
-- Run in Supabase SQL Editor as a database owner after applying migrations.
-- All fixtures are synthetic and the enclosing transaction is always rolled back.
-- Do not remove the final ROLLBACK; this test must never persist fixture data.

begin;

do $test$
declare
  v_actor uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_seller uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_buyer uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_country uuid;
  v_category uuid;
  v_product uuid;
  v_product2 uuid;
  v_store uuid;
  v_verification uuid;
  v_listing uuid;
  v_request uuid;
  v_price uuid;
  v_compat uuid;
  v_report uuid;
  v_result jsonb;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values
    (v_actor,'authenticated','authenticated','phase1-admin@example.invalid','','{}'::jsonb,'{"display_name":"Phase1 Admin","city":"Test City"}'::jsonb,now(),now()),
    (v_seller,'authenticated','authenticated','phase1-seller@example.invalid','','{}'::jsonb,'{"display_name":"Phase1 Seller","city":"Test City"}'::jsonb,now(),now()),
    (v_buyer,'authenticated','authenticated','phase1-buyer@example.invalid','','{}'::jsonb,'{"display_name":"Phase1 Buyer","city":"Test City"}'::jsonb,now(),now());

  insert into public.admin_user_roles(user_id,role) values(v_actor,'super_admin');
  select id into v_country from public.countries limit 1;
  if v_country is null then raise exception 'No country fixture available'; end if;

  insert into public.categories(name,slug)
  values('Phase1 Smoke Category','phase1-smoke-'||substr(gen_random_uuid()::text,1,8))
  returning id into v_category;

  insert into public.products(category_id,name,brand,model,slug,product_type,attributes)
  values(v_category,'Phase1 Smoke Product','TestBrand','ModelA','phase1-smoke-'||substr(gen_random_uuid()::text,1,8),'finished_product','{}'::jsonb)
  returning id into v_product;

  insert into public.products(category_id,name,brand,model,slug,product_type,attributes)
  values(v_category,'Phase1 Smoke Part','TestBrand','ModelB','phase1-smoke-'||substr(gen_random_uuid()::text,1,8),'spare_part','{}'::jsonb)
  returning id into v_product2;

  -- Store approval must be the route that establishes verified status.
  insert into public.seller_stores(owner_id,store_name,city,country_id)
  values(v_seller,'Phase1 Smoke Store','Test City',v_country)
  returning id into v_store;

  insert into public.seller_verification_records(store_id,submitted_by,verification_type,verification_status,evidence_storage_path,evidence_mime_type)
  values(v_store,v_seller,'business','pending','phase1-smoke/evidence.pdf','application/pdf')
  returning id into v_verification;

  v_result := public.admin_review_store_atomic(v_actor,v_store,'approve_business','smoke test',v_verification);
  if v_result->>'verification_status' <> 'verified' then
    raise exception 'Store review failed: %',v_result;
  end if;
  if not exists(
    select 1 from public.seller_verification_records
    where id=v_verification and verification_status='approved' and reviewer_id=v_actor
  ) then raise exception 'Verification record was not atomically approved'; end if;

  insert into public.seller_store_contacts(store_id,contact_phone,whatsapp_number)
  values(v_store,'+2348000000000','+2348000000000');

  insert into public.listings(seller_store_id,product_id,item_condition,asking_price,city,country_id,is_active,moderation_status)
  values(v_store,v_product,'new',1000,'Test City',v_country,true,'approved')
  returning id into v_listing;

  v_result := public.record_seller_contact_request(v_buyer,v_store,v_listing,'phone');
  if (v_result->>'status')::int <> 200 or v_result->>'contact' <> '+2348000000000' then
    raise exception 'Contact request success failed: %',v_result;
  end if;

  insert into public.seller_contact_requests(buyer_id,store_id,listing_id,channel)
  select v_buyer,v_store,v_listing,'phone' from generate_series(1,39);

  v_result := public.record_seller_contact_request(v_buyer,v_store,v_listing,'phone');
  if (v_result->>'status')::int <> 429 then raise exception 'Contact rate limit failed: %',v_result; end if;

  insert into public.product_requests(requested_by,requested_name,brand,model,product_type,category_id,request_status)
  values(v_seller,'Phase1 Requested Product','SmokeBrand','SmokeModel','finished_product',v_category,'pending')
  returning id into v_request;

  v_result := public.admin_process_product_request_atomic(v_actor,v_request,'accept',v_category);
  if v_result->>'request_status' <> 'accepted'
     or not exists(select 1 from public.products where id=(v_result->>'product_id')::uuid) then
    raise exception 'Product request acceptance failed: %',v_result;
  end if;

  insert into public.listings(seller_store_id,product_id,item_condition,asking_price,city,country_id,is_active,moderation_status,price_flag_status)
  values(v_store,v_product2,'new',1000,'Test City',v_country,true,'review_required','review_required')
  returning id into v_listing;

  v_result := public.admin_review_listing_atomic(v_actor,v_listing,'approved',true,'smoke override');
  if v_result->>'moderation_status' <> 'approved' or v_result->>'price_flag_status' <> 'cleared' then
    raise exception 'Listing review failed: %',v_result;
  end if;

  insert into public.price_observations(product_id,submitted_by,item_condition,amount_value,city,source_type)
  values(v_product,v_seller,'new',1000,'Test City','other')
  returning id into v_price;

  v_result := public.admin_review_price_atomic(v_actor,v_price,'approved','smoke price review');
  if v_result->>'review_status' <> 'approved' then raise exception 'Price review failed: %',v_result; end if;

  insert into public.product_compatibilities(part_product_id,compatible_product_id,compatibility_type,submitted_by)
  values(v_product,v_product2,'fits',v_seller)
  returning id into v_compat;

  v_result := public.admin_review_compatibility_atomic(v_actor,v_compat,'approved','smoke compatibility');
  if v_result->>'review_status' <> 'approved' then raise exception 'Compatibility review failed: %',v_result; end if;

  insert into public.user_reports(reporter_id,target_type,target_id,reason)
  values(v_seller,'listing',v_listing,'phase1 smoke test')
  returning id into v_report;

  v_result := public.admin_process_report_atomic(v_actor,v_report,'resolved','smoke report');
  if v_result->>'report_status' <> 'resolved' then raise exception 'Report processing failed: %',v_result; end if;

  perform public.admin_manage_role_atomic(v_actor,v_buyer,'moderator','grant');
  if not exists(select 1 from public.admin_user_roles where user_id=v_buyer and role='moderator') then
    raise exception 'Role grant failed';
  end if;

  perform public.admin_manage_role_atomic(v_actor,v_buyer,'moderator','revoke');
  if exists(select 1 from public.admin_user_roles where user_id=v_buyer and role='moderator') then
    raise exception 'Role revoke failed';
  end if;

  if has_table_privilege('authenticated','public.seller_contact_requests','INSERT') then
    raise exception 'Direct contact request INSERT privilege remains';
  end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename='seller_contact_requests' and cmd='INSERT') then
    raise exception 'Direct contact request INSERT policy remains';
  end if;
end;
$test$;

rollback;
