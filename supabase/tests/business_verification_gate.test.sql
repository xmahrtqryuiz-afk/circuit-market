-- Regression test: account confirmation never grants business verification.
-- All synthetic rows are rolled back.
begin;
do $test$
declare
  v_email_user uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  v_phone_user uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  v_country uuid;
  v_email_store uuid;
  v_phone_store uuid;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,email_confirmed_at)
  values(v_email_user,'authenticated','authenticated','phase1-email-verified@example.invalid','','{}'::jsonb,'{}'::jsonb,now(),now(),now());

  insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,email_confirmed_at,phone_confirmed_at)
  values(v_phone_user,'authenticated','authenticated','phase1-phone-verified@example.invalid','','{}'::jsonb,'{}'::jsonb,now(),now(),now(),now());

  select id into v_country from public.countries limit 1;
  if v_country is null then raise exception 'No country fixture available'; end if;

  insert into public.seller_stores(owner_id,store_name,city,country_id)
  values(v_email_user,'Phase1 Email Verified Store','Test City',v_country)
  returning id into v_email_store;

  insert into public.seller_stores(owner_id,store_name,city,country_id)
  values(v_phone_user,'Phase1 Phone Verified Store','Test City',v_country)
  returning id into v_phone_store;

  if not exists(select 1 from public.seller_stores where id=v_email_store and verification_status='pending' and verification_level='email_confirmed') then
    raise exception 'Email confirmation incorrectly granted business verification';
  end if;
  if not exists(select 1 from public.seller_stores where id=v_phone_store and verification_status='pending' and verification_level='phone_confirmed') then
    raise exception 'Phone confirmation incorrectly granted business verification';
  end if;
  if private.is_verified_store(v_email_store) or private.is_verified_store(v_phone_store) then
    raise exception 'An account-verified store passed the business verification gate';
  end if;
end;
$test$;
rollback;
