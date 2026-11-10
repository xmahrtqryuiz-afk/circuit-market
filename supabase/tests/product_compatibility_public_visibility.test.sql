-- Anonymous readers can see approved compatibility links only.
-- Synthetic products and links are rolled back.
begin;
do $setup$
declare v_country_category uuid; v_part uuid; v_compatible uuid;
begin
 select id into v_country_category from public.categories where is_active=true limit 1;
 if v_country_category is null then raise exception 'No active category fixture available'; end if;
 insert into public.products(category_id,name,slug)
 values(v_country_category,'Phase1 Public Compatibility Part','phase1-public-part-'||substr(gen_random_uuid()::text,1,8))
 returning id into v_part;
 insert into public.products(category_id,name,slug)
 values(v_country_category,'Phase1 Public Compatibility Device','phase1-public-device-'||substr(gen_random_uuid()::text,1,8))
 returning id into v_compatible;
 insert into public.product_compatibilities(part_product_id,compatible_product_id,compatibility_type,review_status)
 values(v_part,v_compatible,'fits','approved');
 insert into public.product_compatibilities(part_product_id,compatible_product_id,compatibility_type)
 values(v_part,v_compatible,'works_with');
 perform set_config('phase1.public_compat.part',v_part::text,true);
end; $setup$;
set local role anon;
do $assert$
begin
 if (select count(*) from public.product_compatibilities where part_product_id=current_setting('phase1.public_compat.part')::uuid and review_status='approved') <> 1 then
  raise exception 'Anonymous client could not read approved compatibility evidence';
 end if;
 if (select count(*) from public.product_compatibilities where part_product_id=current_setting('phase1.public_compat.part')::uuid and review_status='pending') <> 0 then
  raise exception 'Anonymous client can see pending compatibility submissions';
 end if;
end; $assert$;
reset role;
rollback;
