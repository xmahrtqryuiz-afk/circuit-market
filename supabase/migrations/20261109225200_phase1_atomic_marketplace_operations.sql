-- Phase 1: make contact-request throttling and critical moderation/catalogue writes atomic.
-- This is an incremental repair migration. It does not recreate the missing historical migrations.

create or replace function public.record_seller_contact_request(
  p_buyer_id uuid,
  p_store_id uuid,
  p_listing_id uuid,
  p_channel text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_contact text;
  v_count bigint;
begin
  if p_buyer_id is null or p_store_id is null or p_listing_id is null
     or p_channel is null or p_channel not in ('phone', 'whatsapp') then
    return jsonb_build_object('status', 400, 'error', 'A valid store, listing and contact channel are required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_buyer_id::text, 0));

  select s.owner_id,
         case when p_channel = 'phone' then c.contact_phone else c.whatsapp_number end
    into v_owner_id, v_contact
  from public.seller_stores s
  join public.seller_store_contacts c on c.store_id = s.id
  join public.listings l on l.seller_store_id = s.id
  where s.id = p_store_id
    and l.id = p_listing_id
    and s.verification_status = 'verified'
    and l.is_active = true
    and l.moderation_status = 'approved'
  limit 1;

  if not found then
    return jsonb_build_object('status', 404, 'error', 'This listing or seller is not currently contactable');
  end if;

  if v_owner_id = p_buyer_id then
    return jsonb_build_object('status', 403, 'error', 'You cannot unlock your own store contact');
  end if;

  if v_contact is null or length(trim(v_contact)) = 0 then
    return jsonb_build_object('status', 404, 'error', 'This seller has not provided that contact method');
  end if;

  select count(*) into v_count
  from public.seller_contact_requests
  where buyer_id = p_buyer_id
    and created_at >= now() - interval '24 hours';

  if v_count >= 40 then
    return jsonb_build_object('status', 429, 'error', 'Daily contact request limit reached');
  end if;

  insert into public.seller_contact_requests (buyer_id, store_id, listing_id, channel)
  values (p_buyer_id, p_store_id, p_listing_id, p_channel);

  return jsonb_build_object(
    'status', 200,
    'channel', p_channel,
    'contact', v_contact,
    'store_id', p_store_id,
    'listing_id', p_listing_id
  );
end;
$$;

create or replace function public.admin_review_store_atomic(
  p_actor_id uuid,
  p_store_id uuid,
  p_decision text,
  p_review_notes text,
  p_verification_record_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_store public.seller_stores%rowtype;
  v_record public.seller_verification_records%rowtype;
  v_status text;
  v_level text;
begin
  if p_decision is null or p_decision not in ('approve_business', 'reject', 'suspend') then
    raise exception 'Invalid seller review decision' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.admin_user_roles
    where user_id = p_actor_id and role in ('super_admin', 'moderator')
  ) then
    raise exception 'Not authorised to review sellers' using errcode = '42501';
  end if;

  select * into v_store from public.seller_stores
  where id = p_store_id for update;
  if not found then
    raise exception 'Store not found' using errcode = 'P0002';
  end if;
  if v_store.owner_id = p_actor_id then
    raise exception 'You cannot review your own store' using errcode = '42501';
  end if;

  v_status := case p_decision
    when 'approve_business' then 'verified'
    when 'reject' then 'rejected'
    else 'suspended'
  end;
  v_level := case p_decision
    when 'approve_business' then 'business_verified'
    when 'reject' then 'unverified'
    else v_store.verification_level
  end;

  if p_decision = 'approve_business' then
    select * into v_record
    from public.seller_verification_records
    where id = p_verification_record_id
      and store_id = p_store_id
      and verification_type = 'business'
      and verification_status = 'pending'
      and evidence_storage_path is not null
      and evidence_mime_type in ('image/jpeg','image/png','image/webp','application/pdf')
    for update;
    if not found then
      raise exception 'Business verification requires pending evidence' using errcode = 'P0001';
    end if;
  end if;

  update public.seller_stores
  set verification_status = v_status,
      verification_level = v_level,
      verification_reviewed_at = now(),
      verification_reviewed_by = p_actor_id,
      updated_at = now()
  where id = p_store_id;

  if p_decision = 'approve_business' then
    update public.seller_verification_records
    set verification_status = 'approved',
        reviewer_id = p_actor_id,
        reviewed_at = now()
    where id = p_verification_record_id;
  end if;

  insert into public.moderation_events(actor_id, target_type, target_id, action, reason)
  values (p_actor_id, 'store', p_store_id, p_decision, left(p_review_notes, 1000));

  insert into public.audit_logs(actor_id, action, target_type, target_id, metadata)
  values (
    p_actor_id,
    'seller_store_' || p_decision,
    'store',
    p_store_id,
    jsonb_build_object('verification_level', v_level)
  );

  return jsonb_build_object(
    'success', true,
    'store_id', p_store_id,
    'verification_status', v_status,
    'verification_level', v_level
  );
end;
$$;

create or replace function public.admin_process_product_request_atomic(
  p_actor_id uuid,
  p_request_id uuid,
  p_decision text,
  p_category_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.product_requests%rowtype;
  v_product_id uuid;
  v_category_id uuid;
  v_slug text;
  v_base_slug text;
begin
  if p_decision is null or p_decision not in ('accept', 'reject') then
    raise exception 'Invalid product request decision' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.admin_user_roles
    where user_id = p_actor_id and role in ('super_admin', 'catalog_manager')
  ) then
    raise exception 'Not authorised to manage the product catalogue' using errcode = '42501';
  end if;

  select * into v_request from public.product_requests
  where id = p_request_id for update;
  if not found then
    raise exception 'Product request not found' using errcode = 'P0002';
  end if;
  if v_request.requested_by = p_actor_id then
    raise exception 'You cannot approve your own product request' using errcode = '42501';
  end if;
  if v_request.request_status <> 'pending' then
    raise exception 'This product request has already been processed' using errcode = 'P0001';
  end if;

  if p_decision = 'reject' then
    update public.product_requests set request_status = 'rejected' where id = p_request_id;
    insert into public.audit_logs(actor_id, action, target_type, target_id)
    values (p_actor_id, 'product_request_rejected', 'product_request', p_request_id);
    return jsonb_build_object('success', true, 'request_status', 'rejected');
  end if;

  v_category_id := coalesce(p_category_id, v_request.category_id);
  if v_category_id is null then
    raise exception 'Choose a catalogue category before accepting this request' using errcode = '22023';
  end if;
  if not exists (select 1 from public.categories where id = v_category_id and is_active = true) then
    raise exception 'The selected category is not active' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws('|', v_category_id::text, lower(v_request.requested_name), lower(coalesce(v_request.brand, '')), lower(coalesce(v_request.model, ''))),
    1
  ));

  select id into v_product_id
  from public.products
  where category_id = v_category_id
    and lower(name) = lower(v_request.requested_name)
    and lower(coalesce(brand, '')) = lower(coalesce(v_request.brand, ''))
    and lower(coalesce(model, '')) = lower(coalesce(v_request.model, ''))
  limit 1;

  if v_product_id is not null then
    update public.product_requests set request_status = 'duplicate', category_id = v_category_id
    where id = p_request_id;
    insert into public.audit_logs(actor_id, action, target_type, target_id, metadata)
    values (
      p_actor_id, 'product_request_marked_duplicate', 'product_request', p_request_id,
      jsonb_build_object('existing_product_id', v_product_id)
    );
    return jsonb_build_object('success', true, 'request_status', 'duplicate', 'existing_product_id', v_product_id);
  end if;

  v_base_slug := trim(both '-' from regexp_replace(
    lower(concat_ws('-', nullif(v_request.brand, ''), v_request.requested_name, nullif(v_request.model, ''))),
    '[^a-z0-9]+', '-', 'g'
  ));
  if v_base_slug = '' then v_base_slug := 'catalogue-product'; end if;
  v_slug := left(v_base_slug, 100);
  while exists (select 1 from public.products where slug = v_slug) loop
    v_slug := left(v_base_slug, 88) || '-' || substr(gen_random_uuid()::text, 1, 8);
  end loop;

  insert into public.products (
    category_id, name, brand, model, slug, product_type, description, attributes, is_active
  ) values (
    v_category_id, v_request.requested_name, v_request.brand, v_request.model,
    v_slug, v_request.product_type, null, '{}'::jsonb, true
  ) returning id into v_product_id;

  update public.product_requests
  set request_status = 'accepted', category_id = v_category_id
  where id = p_request_id;

  insert into public.audit_logs(actor_id, action, target_type, target_id, metadata)
  values (
    p_actor_id, 'catalogue_product_created', 'product', v_product_id,
    jsonb_build_object('product_request_id', p_request_id)
  );

  return jsonb_build_object(
    'success', true,
    'request_status', 'accepted',
    'product_id', v_product_id
  );
end;
$$;

revoke all on function public.record_seller_contact_request(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_review_store_atomic(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_process_product_request_atomic(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.record_seller_contact_request(uuid, uuid, uuid, text) to service_role;
grant execute on function public.admin_review_store_atomic(uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.admin_process_product_request_atomic(uuid, uuid, text, uuid) to service_role;

drop policy if exists "Buyers record contact requests" on public.seller_contact_requests;
revoke insert on public.seller_contact_requests from anon, authenticated;

create index if not exists seller_contact_requests_buyer_created_at_idx
on public.seller_contact_requests (buyer_id, created_at desc);



create or replace function public.admin_review_price_atomic(
  p_actor_id uuid, p_observation_id uuid, p_decision text, p_review_notes text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_row public.price_observations%rowtype;
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid price review decision' using errcode = '22023';
  end if;
  if not exists (select 1 from public.admin_user_roles where user_id=p_actor_id and role in ('super_admin','price_reviewer','moderator')) then
    raise exception 'Not authorised to review price evidence' using errcode = '42501';
  end if;
  select * into v_row from public.price_observations where id=p_observation_id for update;
  if not found then raise exception 'Price observation not found' using errcode = 'P0002'; end if;
  if v_row.submitted_by=p_actor_id then raise exception 'You cannot review your own price submission' using errcode = '42501'; end if;
  if v_row.review_status<>'pending' then raise exception 'This price observation has already been reviewed' using errcode = 'P0001'; end if;
  update public.price_observations set review_status=p_decision, reviewed_by=p_actor_id,
    reviewed_at=now(), review_notes=left(p_review_notes,1000) where id=p_observation_id;
  insert into public.moderation_events(actor_id,target_type,target_id,action,reason)
    values(p_actor_id,'price_observation',p_observation_id,p_decision,left(p_review_notes,1000));
  insert into public.audit_logs(actor_id,action,target_type,target_id,metadata)
    values(p_actor_id,'price_observation_'||p_decision,'price_observation',p_observation_id,
      jsonb_build_object('product_id',v_row.product_id));
  return jsonb_build_object('success',true,'observation_id',p_observation_id,'review_status',p_decision);
end;
$$;

create or replace function public.admin_review_listing_atomic(
  p_actor_id uuid, p_listing_id uuid, p_decision text, p_override_price_flag boolean, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_listing public.listings%rowtype; v_owner_id uuid; v_flag_status text;
begin
  if p_decision is null or p_decision not in ('approved','rejected','suspended') then
    raise exception 'Invalid listing moderation decision' using errcode = '22023';
  end if;
  if not exists (select 1 from public.admin_user_roles where user_id=p_actor_id and role in ('super_admin','moderator')) then
    raise exception 'Not authorised to review listings' using errcode = '42501';
  end if;
  select * into v_listing from public.listings where id=p_listing_id for update;
  if not found then raise exception 'Listing not found' using errcode = 'P0002'; end if;
  select owner_id into v_owner_id from public.seller_stores where id=v_listing.seller_store_id;
  if not found then raise exception 'Seller store not found' using errcode = 'P0002'; end if;
  if v_owner_id=p_actor_id then raise exception 'You cannot review your own listing' using errcode = '42501'; end if;
  if p_decision='approved' and v_listing.price_flag_status='review_required' and not coalesce(p_override_price_flag,false) then
    raise exception 'Listing has an unresolved price or duplicate flag' using errcode = 'P0001';
  end if;
  v_flag_status := case when p_decision='approved' and coalesce(p_override_price_flag,false) then 'cleared' else v_listing.price_flag_status end;
  update public.listings set moderation_status=p_decision,
    is_active=case when p_decision in ('rejected','suspended') then false else is_active end,
    price_flag_status=v_flag_status,
    price_flag_reason=case when p_decision='approved' and coalesce(p_override_price_flag,false) then null else price_flag_reason end,
    updated_at=now()
  where id=p_listing_id;
  insert into public.moderation_events(actor_id,target_type,target_id,action,reason,metadata)
    values(p_actor_id,'listing',p_listing_id,p_decision,left(p_reason,1000),
      jsonb_build_object('price_flag_override',coalesce(p_override_price_flag,false)));
  insert into public.audit_logs(actor_id,action,target_type,target_id,metadata)
    values(p_actor_id,'listing_'||p_decision,'listing',p_listing_id,
      jsonb_build_object('price_flag_override',coalesce(p_override_price_flag,false)));
  return jsonb_build_object('success',true,'listing_id',p_listing_id,
    'moderation_status',p_decision,'price_flag_status',v_flag_status);
end;
$$;

create or replace function public.admin_review_compatibility_atomic(
  p_actor_id uuid, p_compatibility_id uuid, p_decision text, p_notes text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_row public.product_compatibilities%rowtype;
begin
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid compatibility review decision' using errcode = '22023';
  end if;
  if not exists (select 1 from public.admin_user_roles where user_id=p_actor_id and role in ('super_admin','catalog_manager')) then
    raise exception 'Not authorised to review compatibility data' using errcode = '42501';
  end if;
  select * into v_row from public.product_compatibilities where id=p_compatibility_id for update;
  if not found then raise exception 'Compatibility record not found' using errcode = 'P0002'; end if;
  if v_row.submitted_by=p_actor_id then raise exception 'You cannot review your own compatibility submission' using errcode = '42501'; end if;
  if v_row.review_status<>'pending' then raise exception 'This compatibility record has already been reviewed' using errcode = 'P0001'; end if;
  update public.product_compatibilities set review_status=p_decision,reviewed_by=p_actor_id,
    reviewed_at=now(),notes=left(p_notes,1000) where id=p_compatibility_id;
  insert into public.moderation_events(actor_id,target_type,target_id,action,reason)
    values(p_actor_id,'product_compatibility',p_compatibility_id,p_decision,left(p_notes,1000));
  insert into public.audit_logs(actor_id,action,target_type,target_id)
    values(p_actor_id,'product_compatibility_'||p_decision,'product_compatibility',p_compatibility_id);
  return jsonb_build_object('success',true,'compatibility_id',p_compatibility_id,'review_status',p_decision);
end;
$$;

create or replace function public.admin_process_report_atomic(
  p_actor_id uuid, p_report_id uuid, p_decision text, p_note text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_row public.user_reports%rowtype;
begin
  if p_decision is null or p_decision not in ('reviewing','resolved','dismissed') then
    raise exception 'Invalid report decision' using errcode = '22023';
  end if;
  if not exists (select 1 from public.admin_user_roles where user_id=p_actor_id and role in ('super_admin','moderator','support')) then
    raise exception 'Not authorised to manage reports' using errcode = '42501';
  end if;
  select * into v_row from public.user_reports where id=p_report_id for update;
  if not found then raise exception 'Report not found' using errcode = 'P0002'; end if;
  if v_row.reporter_id=p_actor_id then raise exception 'You cannot review your own report' using errcode = '42501'; end if;
  if v_row.report_status in ('resolved','dismissed') then raise exception 'This report has already been closed' using errcode = 'P0001'; end if;
  update public.user_reports set report_status=p_decision where id=p_report_id;
  insert into public.moderation_events(actor_id,target_type,target_id,action,reason)
    values(p_actor_id,'user_report',p_report_id,p_decision,left(p_note,1000));
  insert into public.audit_logs(actor_id,action,target_type,target_id)
    values(p_actor_id,'user_report_'||p_decision,'user_report',p_report_id);
  return jsonb_build_object('success',true,'report_id',p_report_id,'report_status',p_decision);
end;
$$;

create or replace function public.admin_manage_role_atomic(
  p_actor_id uuid, p_target_id uuid, p_role text, p_action text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_count bigint;
begin
  if p_role is null or p_role not in ('super_admin','moderator','support','price_reviewer','catalog_manager')
     or p_action is null or p_action not in ('grant','revoke') then
    raise exception 'Invalid administrator role action' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(824733911);
  if not exists (select 1 from public.admin_user_roles where user_id=p_actor_id and role='super_admin') then
    raise exception 'Only a super administrator can manage administrator roles' using errcode = '42501';
  end if;
  if p_action='revoke' and p_role='super_admin' then
    select count(*) into v_count from public.admin_user_roles where role='super_admin';
    if v_count<=1 then raise exception 'The last super administrator cannot be removed' using errcode = 'P0001'; end if;
    delete from public.admin_user_roles where user_id=p_target_id and role=p_role;
  elsif p_action='grant' then
    insert into public.admin_user_roles(user_id,role,granted_by)
      values(p_target_id,p_role,p_actor_id) on conflict(user_id,role) do nothing;
  else
    delete from public.admin_user_roles where user_id=p_target_id and role=p_role;
  end if;
  insert into public.audit_logs(actor_id,action,target_type,target_id,metadata)
    values(p_actor_id,'admin_role_'||p_action,'user',p_target_id,jsonb_build_object('role',p_role));
  return jsonb_build_object('success',true,'user_id',p_target_id,'role',p_role,'action',p_action);
end;
$$;

revoke all on function public.admin_review_price_atomic(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.admin_review_listing_atomic(uuid,uuid,text,boolean,text) from public, anon, authenticated;
revoke all on function public.admin_review_compatibility_atomic(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.admin_process_report_atomic(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.admin_manage_role_atomic(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.admin_review_price_atomic(uuid,uuid,text,text) to service_role;
grant execute on function public.admin_review_listing_atomic(uuid,uuid,text,boolean,text) to service_role;
grant execute on function public.admin_review_compatibility_atomic(uuid,uuid,text,text) to service_role;
grant execute on function public.admin_process_report_atomic(uuid,uuid,text,text) to service_role;
grant execute on function public.admin_manage_role_atomic(uuid,uuid,text,text) to service_role;
