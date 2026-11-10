-- Regression test for the buyer deal-confirmation RLS gate.
-- Only a buyer confirming an active approved listing from a business-verified
-- store may insert a pending deal. All fixtures are rolled back.
begin;
insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('abababab-abab-4bab-8bab-abababababab','authenticated','authenticated','phase1-deal-seller@example.invalid','','{}'::jsonb,'{"display_name":"Deal Seller","city":"Test City"}'::jsonb,now(),now()),
('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','authenticated','authenticated','phase1-deal-buyer@example.invalid','','{}'::jsonb,'{"display_name":"Deal Buyer","city":"Test City"}'::jsonb,now(),now()),
('dededede-dede-4ded-8ded-dededededede','authenticated','authenticated','phase1-deal-unverified@example.invalid','','{}'::jsonb,'{"display_name":"Unverified Seller","city":"Test City"}'::jsonb,now(),now());

do $setup$
declare
 v_country uuid; v_category uuid; v_product uuid;
 v_seller_store uuid; v_buyer_store uuid; v_unverified_store uuid;
 v_valid uuid; v_pending uuid; v_inactive uuid; v_unverified uuid; v_own uuid;
begin
 select id into v_country from public.countries limit 1;
 select id into v_category from public.categories where is_active=true limit 1;
 if v_country is null or v_category is null then raise exception 'Required country/category fixture missing'; end if;

 insert into public.products(category_id,name,slug)
 values(v_category,'Phase1 Deal Gate Product','phase1-deal-'||substr(gen_random_uuid()::text,1,8))
 returning id into v_product;

 insert into public.seller_stores(owner_id,store_name,city,country_id)
 values('abababab-abab-4bab-8bab-abababababab','Deal Gate Seller Store','Test City',v_country)
 returning id into v_seller_store;
 insert into public.seller_stores(owner_id,store_name,city,country_id)
 values('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','Deal Gate Buyer Store','Test City',v_country)
 returning id into v_buyer_store;
 insert into public.seller_stores(owner_id,store_name,city,country_id)
 values('dededede-dede-4ded-8ded-dededededede','Deal Gate Unverified Store','Test City',v_country)
 returning id into v_unverified_store;

 update public.seller_stores set verification_status='verified',verification_level='business_verified' where id in (v_seller_store,v_buyer_store);

 insert into public.listings(seller_store_id,product_id,item_condition,asking_price,city,country_id,is_active,moderation_status)
 values(v_seller_store,v_product,'new',1000,'Test City',v_country,true,'approved') returning id into v_valid;
 insert into public.listings(seller_store_id,product_id,item_condition,asking_price,city,country_id,is_active,moderation_status)
 values(v_seller_store,v_product,'new',1000,'Test City',v_country,true,'review_required') returning id into v_pending;
 insert into public.listings(seller_store_id,product_id,item_condition,asking_price,city,country_id,is_active,moderation_status)
 values(v_seller_store,v_product,'new',1000,'Test City',v_country,false,'approved') returning id into v_inactive;
 insert into public.listings(seller_store_id,product_id,item_condition,asking_price,city,country_id,is_active,moderation_status)
 values(v_buyer_store,v_product,'new',1000,'Test City',v_country,true,'approved') returning id into v_own;
 insert into public.listings(seller_store_id,product_id,item_condition,asking_price,city,country_id,is_active,moderation_status)
 values(v_unverified_store,v_product,'new',1000,'Test City',v_country,true,'approved') returning id into v_unverified;

 perform set_config('request.jwt.claim.sub','cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',true);
 perform set_config('phase1.deal.valid',v_valid::text,true);
 perform set_config('phase1.deal.pending',v_pending::text,true);
 perform set_config('phase1.deal.inactive',v_inactive::text,true);
 perform set_config('phase1.deal.unverified',v_unverified::text,true);
 perform set_config('phase1.deal.own',v_own::text,true);
 perform set_config('phase1.deal.seller_store',v_seller_store::text,true);
 perform set_config('phase1.deal.buyer_store',v_buyer_store::text,true);
 perform set_config('phase1.deal.unverified_store',v_unverified_store::text,true);
end;
$setup$;

set local role authenticated;
insert into public.deal_confirmations(buyer_id,store_id,listing_id,buyer_confirmed_at)
values('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',current_setting('phase1.deal.seller_store')::uuid,current_setting('phase1.deal.valid')::uuid,now());

do $assert$
begin
  begin
    insert into public.deal_confirmations(buyer_id,store_id,listing_id,buyer_confirmed_at)
    values('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',current_setting('phase1.deal.seller_store')::uuid,current_setting('phase1.deal.pending')::uuid,now());
    raise exception 'SECURITY FAILURE: pending listing accepted for deal confirmation';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.deal_confirmations(buyer_id,store_id,listing_id,buyer_confirmed_at)
    values('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',current_setting('phase1.deal.seller_store')::uuid,current_setting('phase1.deal.inactive')::uuid,now());
    raise exception 'SECURITY FAILURE: inactive listing accepted for deal confirmation';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.deal_confirmations(buyer_id,store_id,listing_id,buyer_confirmed_at)
    values('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',current_setting('phase1.deal.unverified_store')::uuid,current_setting('phase1.deal.unverified')::uuid,now());
    raise exception 'SECURITY FAILURE: unverified store accepted for deal confirmation';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.deal_confirmations(buyer_id,store_id,listing_id,buyer_confirmed_at)
    values('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',current_setting('phase1.deal.buyer_store')::uuid,current_setting('phase1.deal.own')::uuid,now());
    raise exception 'SECURITY FAILURE: buyer could confirm a deal for own store';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.deal_confirmations(buyer_id,store_id,listing_id,buyer_confirmed_at)
    values('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',current_setting('phase1.deal.seller_store')::uuid,current_setting('phase1.deal.valid')::uuid,null);
    raise exception 'SECURITY FAILURE: empty buyer confirmation accepted';
  exception when insufficient_privilege then null; end;
end;
$assert$;
reset role;
rollback;
