-- A rejected seller can submit fresh business evidence and return to the admin review queue.
-- Only the owning seller's pending business-evidence submission reopens a rejected store.

create or replace function private.reopen_rejected_store_on_business_resubmission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.verification_type = 'business'
     and new.verification_status = 'pending'
     and new.evidence_storage_path is not null then
    update public.seller_stores
    set verification_status = 'pending',
        verification_level = 'unverified',
        verification_reviewed_at = null,
        verification_reviewed_by = null,
        updated_at = now()
    where id = new.store_id
      and owner_id = new.submitted_by
      and verification_status = 'rejected';
  end if;

  return new;
end;
$function$;

drop trigger if exists reopen_rejected_store_on_business_resubmission on public.seller_verification_records;
create trigger reopen_rejected_store_on_business_resubmission
after insert on public.seller_verification_records
for each row
execute function private.reopen_rejected_store_on_business_resubmission();
