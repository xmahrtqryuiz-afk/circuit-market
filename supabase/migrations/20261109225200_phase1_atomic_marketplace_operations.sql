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
     or p_channel not in ('phone', 'whatsapp') then
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
  if p_decision not in ('approve_business', 'reject', 'suspend') then
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
  v_slug text;
  v_base_slug text;
begin
  if p_decision not in ('accept', 'reject') then
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

  if p_category_id is null then
    raise exception 'Choose a catalogue category before accepting this request' using errcode = '22023';
  end if;
  if not exists (select 1 from public.categories where id = p_category_id and is_active = true) then
    raise exception 'The selected category is not active' using errcode = '22023';
  end if;

  select id into v_product_id
  from public.products
  where category_id = p_category_id
    and lower(name) = lower(v_request.requested_name)
    and lower(coalesce(brand, '')) = lower(coalesce(v_request.brand, ''))
    and lower(coalesce(model, '')) = lower(coalesce(v_request.model, ''))
  limit 1;

  if v_product_id is not null then
    update public.product_requests set request_status = 'duplicate', category_id = p_category_id
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
    p_category_id, v_request.requested_name, v_request.brand, v_request.model,
    v_slug, v_request.product_type, null, '{}'::jsonb, true
  ) returning id into v_product_id;

  update public.product_requests
  set request_status = 'accepted', category_id = p_category_id
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
