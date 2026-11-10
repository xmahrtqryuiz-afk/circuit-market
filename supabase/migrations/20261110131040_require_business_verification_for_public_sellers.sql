-- Account email/phone confirmation must not bypass business verification.
-- A store remains pending until an authorised reviewer approves its business evidence.

create or replace function private.set_initial_store_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email_confirmed timestamptz;
  v_phone_confirmed timestamptz;
begin
  select u.email_confirmed_at, u.phone_confirmed_at
    into v_email_confirmed, v_phone_confirmed
  from auth.users u
  where u.id = new.owner_id;

  -- Account verification is not business verification.
  -- Stores remain pending until an authorised reviewer approves business evidence.
  new.verification_status := 'pending';
  new.verification_reviewed_at := null;
  new.verification_reviewed_by := null;

  if v_phone_confirmed is not null then
    new.verification_level := 'phone_confirmed';
  elsif v_email_confirmed is not null then
    new.verification_level := 'email_confirmed';
  else
    new.verification_level := 'unverified';
  end if;

  return new;
end;
$function$;
