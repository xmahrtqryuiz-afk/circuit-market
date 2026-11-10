-- Regression test: rejected sellers can resubmit business evidence and re-enter review.
-- Synthetic users, store, and evidence are always rolled back.
begin;
insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('abababab-abab-4bab-8bab-abababababab','authenticated','authenticated','phase1-resubmit-seller@example.invalid','','{}'::jsonb,'{"display_name":"Resubmit Seller","city":"Test City"}'::jsonb,now(),now()),
('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','authenticated','authenticated','phase1-resubmit-admin@example.invalid','','{}'::jsonb,'{"display_name":"Review Admin","city":"Test City"}'::jsonb,now(),now());

do $setup$
declare v_country uuid; v_store uuid;
begin
 select id into v_country from public.countries limit 1;
 if v_country is null then raise exception 'No country fixture available'; end if;
 insert into public.seller_stores(owner_id,store_name,city,country_id)
 values('abababab-abab-4bab-8bab-abababababab','Resubmission Test Store','Test City',v_country)
 returning id into v_store;
 update public.seller_stores set verification_status='rejected',verification_level='unverified',verification_reviewed_at=now(),verification_reviewed_by='cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd' where id=v_store;
 perform set_config('request.jwt.claim.sub','abababab-abab-4bab-8bab-abababababab',true);
 perform set_config('phase1.resubmit.store',v_store::text,true);
end; $setup$;

set local role authenticated;
insert into public.seller_verification_records(store_id,submitted_by,verification_type,evidence_storage_path,evidence_mime_type)
values(current_setting('phase1.resubmit.store')::uuid,'abababab-abab-4bab-8bab-abababababab','business','abababab-abab-4bab-8bab-abababababab/retry/evidence.pdf','application/pdf');

do $assert$
begin
 if not exists(select 1 from public.seller_stores where id=current_setting('phase1.resubmit.store')::uuid and verification_status='pending' and verification_level='unverified') then
  raise exception 'Rejected store did not return to the pending review queue';
 end if;
end; $assert$;
reset role;

do $assert_admin$
begin
 if exists(select 1 from public.seller_stores where id=current_setting('phase1.resubmit.store')::uuid and (verification_reviewed_at is not null or verification_reviewed_by is not null)) then
  raise exception 'Prior review metadata was not cleared on resubmission';
 end if;
end; $assert_admin$;
rollback;
