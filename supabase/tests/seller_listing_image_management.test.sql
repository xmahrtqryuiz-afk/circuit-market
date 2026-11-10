-- Regression test for seller listing-image reorder and delete permissions.
-- Synthetic users, store, product, listing and image rows are rolled back.
begin;
insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('abababab-abab-4bab-8bab-abababababab','authenticated','authenticated','phase1-image-owner@example.invalid','','{}'::jsonb,'{"display_name":"Image Owner","city":"Test City"}'::jsonb,now(),now()),
('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','authenticated','authenticated','phase1-image-other@example.invalid','','{}'::jsonb,'{"display_name":"Other Uploader","city":"Test City"}'::jsonb,now(),now());

do $setup$
declare v_country uuid; v_category uuid; v_product uuid; v_store uuid; v_listing uuid; v_image_one uuid; v_image_two uuid; v_foreign_image uuid;
begin
 select id into v_country from public.countries limit 1;
 select id into v_category from public.categories where is_active=true limit 1;
 if v_country is null or v_category is null then raise exception 'Required country/category fixture missing'; end if;
 insert into public.products(category_id,name,slug)
 values(v_category,'Phase1 Image Management Product','phase1-image-'||substr(gen_random_uuid()::text,1,8))
 returning id into v_product;
 insert into public.seller_stores(owner_id,store_name,city,country_id)
 values('abababab-abab-4bab-8bab-abababababab','Image Management Test Store','Test City',v_country)
 returning id into v_store;
 insert into public.listings(seller_store_id,product_id,item_condition,asking_price,city,country_id,is_active,moderation_status)
 values(v_store,v_product,'new',1000,'Test City',v_country,true,'review_required')
 returning id into v_listing;
 insert into public.listing_images(listing_id,uploaded_by,storage_path,alt_text,sort_order)
 values(v_listing,'abababab-abab-4bab-8bab-abababababab','abababab-abab-4bab-8bab-abababababab/'||v_listing||'/one.webp','Image one',0)
 returning id into v_image_one;
 insert into public.listing_images(listing_id,uploaded_by,storage_path,alt_text,sort_order)
 values(v_listing,'abababab-abab-4bab-8bab-abababababab','abababab-abab-4bab-8bab-abababababab/'||v_listing||'/two.webp','Image two',1)
 returning id into v_image_two;
 insert into public.listing_images(listing_id,uploaded_by,storage_path,alt_text,sort_order)
 values(v_listing,'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd/'||v_listing||'/foreign.webp','Foreign uploader',2)
 returning id into v_foreign_image;
 perform set_config('phase1.image.one',v_image_one::text,true);
 perform set_config('phase1.image.two',v_image_two::text,true);
 perform set_config('phase1.image.foreign',v_foreign_image::text,true);
end; $setup$;

select set_config('request.jwt.claim.sub','abababab-abab-4bab-8bab-abababababab',true);
set local role authenticated;
update public.listing_images set sort_order=1 where id=current_setting('phase1.image.one')::uuid;
update public.listing_images set sort_order=0 where id=current_setting('phase1.image.two')::uuid;

do $assert_reorder$
declare v_deleted integer;
begin
 if not exists(select 1 from public.listing_images where id=current_setting('phase1.image.one')::uuid and sort_order=1) then raise exception 'Owner could not reorder first image'; end if;
 if not exists(select 1 from public.listing_images where id=current_setting('phase1.image.two')::uuid and sort_order=0) then raise exception 'Owner could not reorder second image'; end if;
 delete from public.listing_images where id=current_setting('phase1.image.foreign')::uuid;
 get diagnostics v_deleted = row_count;
 if v_deleted <> 0 then raise exception 'SECURITY FAILURE: owner deleted an image uploaded by another user'; end if;
 delete from public.listing_images where id=current_setting('phase1.image.one')::uuid;
 get diagnostics v_deleted = row_count;
 if v_deleted <> 1 then raise exception 'Owner could not delete own image'; end if;
end; $assert_reorder$;
reset role;
rollback;
