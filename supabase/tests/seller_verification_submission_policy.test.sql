-- Verify sellers can submit evidence as pending but cannot set verification state.
-- The profile/store fixtures are synthetic and are always rolled back.

begin;

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(
  '12121212-1212-4121-8121-121212121212',
  'authenticated','authenticated','phase1-seller-verification@example.invalid','',
  '{}'::jsonb,
  '{"display_name":"Seller Verification Probe","city":"Test City"}'::jsonb,
  now(),now()
);

do $setup$
declare
  v_country uuid;
  v_store uuid;
begin
  select id into v_country from public.countries limit 1;
  if v_country is null then raise exception 'No country fixture available'; end if;

  insert into public.seller_stores(owner_id,store_name,city,country_id)
  values('12121212-1212-4121-8121-121212121212','Seller Verification Probe Store','Test City',v_country)
  returning id into v_store;

  perform set_config('request.jwt.claim.sub','12121212-1212-4121-8121-121212121212',true);
  perform set_config('phase1.seller.store',v_store::text,true);
end;
$setup$;

set local role authenticated;

insert into public.seller_verification_records(store_id,submitted_by,verification_type,evidence_storage_path,evidence_mime_type)
values(
  current_setting('phase1.seller.store')::uuid,
  '12121212-1212-4121-8121-121212121212',
  'business',
  '12121212-1212-4121-8121-121212121212/test/evidence.pdf',
  'application/pdf'
)
returning verification_status;

do $assert$
begin
  begin
    insert into public.seller_verification_records(store_id,submitted_by,verification_type,verification_status,evidence_storage_path,evidence_mime_type)
    values(
      current_setting('phase1.seller.store')::uuid,
      '12121212-1212-4121-8121-121212121212',
      'business','approved',
      '12121212-1212-4121-8121-121212121212/test/evidence2.pdf',
      'application/pdf'
    );
    raise exception 'SECURITY FAILURE: seller was able to set approved verification status';
  exception when insufficient_privilege then null;
  end;
end;
$assert$;

reset role;
rollback;
