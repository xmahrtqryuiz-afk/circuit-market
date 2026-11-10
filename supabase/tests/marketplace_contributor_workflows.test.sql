-- End-to-end regression coverage for reports, compatibility, mutual deals and reviews.
-- Synthetic users and all records are rolled back.
begin;

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('abababab-abab-4bab-8bab-abababababab','authenticated','authenticated','phase1-workflow-seller@example.invalid','','{}'::jsonb,'{"display_name":"Workflow Seller","city":"Test City"}'::jsonb,now(),now()),
('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','authenticated','authenticated','phase1-workflow-buyer@example.invalid','','{}'::jsonb,'{"display_name":"Workflow Buyer","city":"Test City"}'::jsonb,now(),now());

do $setup$
declare
 v_country uuid; v_category uuid; v_product uuid; v_other_product uuid;
 v_store uuid; v_listing uuid;
begin
 select id into v_country from public.countries limit 1;
 select id into v_category from public.categories where is_active=true limit 1;
 if v_country is null or v_category is null then raise exception 'Required country/category fixture missing'; end if;

 insert into public.products(category_id,name,slug)
 values(v_category,'Phase1 Workflow Product','phase1-workflow-'||substr(gen_random_uuid()::text,1,8))
 returning id into v_product;
 insert into public.products(category_id,name,slug)
 values(v_category,'Phase1 Workflow Compatible Product','phase1-workflow-compatible-'||substr(gen_random_uuid()::text,1,8))
 returning id into v_other_product;

 insert into public.seller_stores(owner_id,store_name,city,country_id)
 values('abababab-abab-4bab-8bab-abababababab','Workflow Test Store','Test City',v_country)
 returning id into v_store;
 update public.seller_stores set verification_status='verified',verification_level='business_verified' where id=v_store;

 insert into public.listings(seller_store_id,product_id,item_condition,asking_price,city,country_id,is_active,moderation_status)
 values(v_store,v_product,'new',150000,'Test City',v_country,true,'approved')
 returning id into v_listing;

 perform set_config('phase1.workflow.store',v_store::text,true);
 perform set_config('phase1.workflow.listing',v_listing::text,true);
 perform set_config('phase1.workflow.product',v_product::text,true);
 perform set_config('phase1.workflow.other_product',v_other_product::text,true);
end;
$setup$;

-- Buyer can file a report, but cannot impersonate another reporter.
select set_config('request.jwt.claim.sub','cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',true);
set local role authenticated;

insert into public.user_reports(reporter_id,target_type,target_id,reason,details)
values('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','listing',current_setting('phase1.workflow.listing')::uuid,'misleading_listing','Regression test report');

do $report_assert$
begin
 if not exists(select 1 from public.user_reports where reporter_id=auth.uid() and target_id=current_setting('phase1.workflow.listing')::uuid and report_status='open') then
  raise exception 'Report was not created in the open queue';
 end if;
 begin
  insert into public.user_reports(reporter_id,target_type,target_id,reason)
  values('abababab-abab-4bab-8bab-abababababab','listing',current_setting('phase1.workflow.listing')::uuid,'spoofed_reporter');
  raise exception 'SECURITY FAILURE: report reporter identity was spoofed';
 exception when insufficient_privilege then null; end;
end;
$report_assert$;

-- Compatibility submissions are pending by default; callers cannot self-approve.
insert into public.product_compatibilities(part_product_id,compatible_product_id,compatibility_type,notes,submitted_by)
values(current_setting('phase1.workflow.product')::uuid,current_setting('phase1.workflow.other_product')::uuid,'fits','Regression test evidence','cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd');

do $compat_assert$
begin
 if not exists(select 1 from public.product_compatibilities where submitted_by=auth.uid() and part_product_id=current_setting('phase1.workflow.product')::uuid and review_status='pending') then
  raise exception 'Compatibility suggestion was not pending';
 end if;
 begin
  insert into public.product_compatibilities(part_product_id,compatible_product_id,compatibility_type,submitted_by,review_status)
  values(current_setting('phase1.workflow.product')::uuid,current_setting('phase1.workflow.other_product')::uuid,'works_with',auth.uid(),'approved');
  raise exception 'SECURITY FAILURE: contributor self-approved compatibility';
 exception when insufficient_privilege then null; end;
end;
$compat_assert$;

-- Buyer confirms purchase interest, then the store owner confirms; trigger sets confirmed.
insert into public.deal_confirmations(buyer_id,store_id,listing_id,buyer_confirmed_at)
values('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',current_setting('phase1.workflow.store')::uuid,current_setting('phase1.workflow.listing')::uuid,now());

select set_config('request.jwt.claim.sub','abababab-abab-4bab-8bab-abababababab',true);
update public.deal_confirmations
set seller_confirmed_at=now()
where listing_id=current_setting('phase1.workflow.listing')::uuid and deal_status='pending';

do $deal_assert$
begin
 if not exists(select 1 from public.deal_confirmations where listing_id=current_setting('phase1.workflow.listing')::uuid and deal_status='confirmed' and seller_confirmed_at is not null) then
  raise exception 'Deal did not become confirmed after seller confirmation';
 end if;
end;
$deal_assert$;

-- Only the buyer can review the confirmed deal. Both review types remain pending moderation.
select set_config('request.jwt.claim.sub','cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',true);
insert into public.marketplace_reviews(deal_id,reviewer_id,review_type,store_id,rating,review_text)
select id,'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','seller',current_setting('phase1.workflow.store')::uuid,5,'Seller workflow test'
from public.deal_confirmations where listing_id=current_setting('phase1.workflow.listing')::uuid;

insert into public.marketplace_reviews(deal_id,reviewer_id,review_type,product_id,rating,review_text)
select d.id,'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','product',current_setting('phase1.workflow.product')::uuid,5,'Product workflow test'
from public.deal_confirmations d where d.listing_id=current_setting('phase1.workflow.listing')::uuid;

do $review_assert$
begin
 if (select count(*) from public.marketplace_reviews where reviewer_id=auth.uid() and review_status='pending') <> 2 then
  raise exception 'Both seller and product reviews should be pending moderation';
 end if;
 begin
  insert into public.marketplace_reviews(deal_id,reviewer_id,review_type,store_id,rating,review_status)
  select id,auth.uid(),'seller',current_setting('phase1.workflow.store')::uuid,5,'approved'
  from public.deal_confirmations where listing_id=current_setting('phase1.workflow.listing')::uuid;
  raise exception 'SECURITY FAILURE: reviewer self-approved a marketplace review';
 exception when insufficient_privilege then null; end;
end;
$review_assert$;

reset role;
rollback;
