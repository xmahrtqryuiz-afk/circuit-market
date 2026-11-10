"use client";

import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type Category = { id: string; name: string };
type Store = { id: string; store_name: string; description: string | null; city: string; area: string | null; verification_status: string; verification_level: string; is_open: boolean };
type CatalogueProduct = { id: string; name: string; brand: string | null; model: string | null; category_id: string };
type SellerListing = { id: string; product_id: string; product_name: string; asking_price: number; item_condition: string; variant_label: string | null; quantity: number; city: string; area: string | null; notes: string | null; is_active: boolean; moderation_status: string; created_at: string };
type ProductRequest = { id: string; requested_name: string; brand: string | null; model: string | null; request_status: string; created_at: string };
type VerificationRecord = { id: string; verification_type: string; verification_status: string; created_at: string };

const conditions = ["new", "used", "refurbished", "new_aftermarket", "used_salvaged"];
const productTypes = ["finished_product", "spare_part", "component", "tool", "accessory"];

export default function SellerWorkspace({ user, categories }: { user: User | null; categories: Category[] }) {
  const [store, setStore] = useState<Store | null>(null);
  const [ownListings, setOwnListings] = useState<SellerListing[]>([]);
  const [ownRequests, setOwnRequests] = useState<ProductRequest[]>([]);
  const [verificationRecords, setVerificationRecords] = useState<VerificationRecord[]>([]);
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState({ variant_label: "", item_condition: "new", asking_price: "", quantity: "1", city: "", area: "", notes: "" });
  const [catalogue, setCatalogue] = useState<CatalogueProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [verificationFile, setVerificationFile] = useState<File | null>(null);
  const [listingImages, setListingImages] = useState<File[]>([]);
  const [storeForm, setStoreForm] = useState({ store_name: "", description: "", city: "Port Harcourt", area: "", contact_phone: "", whatsapp_number: "" });
  const [listingForm, setListingForm] = useState({ product_id: "", variant_label: "", item_condition: "new", asking_price: "", quantity: "1", city: "Port Harcourt", area: "", notes: "" });
  const [requestForm, setRequestForm] = useState({ requested_name: "", brand: "", model: "", product_type: "finished_product", category_id: "", compatibility_notes: "" });

  useEffect(() => {
    let active = true;
    async function loadWorkspace() {
      if (!user || !supabase) { setStore(null); setCatalogue([]); setOwnListings([]); setOwnRequests([]); setVerificationRecords([]); return; }
      setLoading(true); setError("");
      try {
        const [storeResult, productsResult] = await Promise.all([
          supabase.from("seller_stores").select("id,store_name,description,city,area,verification_status,verification_level,is_open").eq("owner_id", user.id).maybeSingle(),
          supabase.from("products").select("id,name,brand,model,category_id").eq("is_active", true).order("name").limit(300),
        ]);
        if (storeResult.error) throw storeResult.error;
        if (productsResult.error) throw productsResult.error;
        if (!active) return;
        setStore(storeResult.data as Store | null);
        setCatalogue((productsResult.data ?? []) as CatalogueProduct[]);
        if (!storeResult.data) { setOwnListings([]); setOwnRequests([]); setVerificationRecords([]); }
        if (storeResult.data) {
          const s = storeResult.data as Store;
          const [contactResult, verificationResult] = await Promise.all([
            supabase.from("seller_store_contacts").select("contact_phone,whatsapp_number").eq("store_id", s.id).maybeSingle(),
            supabase.from("seller_verification_records").select("id,verification_type,verification_status,created_at").eq("store_id", s.id).order("created_at", { ascending: false }).limit(10),
          ]);
          if (contactResult.error) throw contactResult.error;
          if (verificationResult.error) throw verificationResult.error;
          if (!active) return;
          setVerificationRecords((verificationResult.data ?? []) as VerificationRecord[]);
          setStoreForm({ store_name: s.store_name, description: s.description ?? "", city: s.city, area: s.area ?? "", contact_phone: contactResult.data?.contact_phone ?? "", whatsapp_number: contactResult.data?.whatsapp_number ?? "" });
          const [listingResult, requestResult] = await Promise.all([
            supabase.from("listings").select("id,product_id,asking_price,item_condition,variant_label,quantity,city,area,notes,is_active,moderation_status,created_at").eq("seller_store_id", s.id).order("created_at", { ascending: false }),
            supabase.from("product_requests").select("id,requested_name,brand,model,request_status,created_at").eq("requested_by", user.id).order("created_at", { ascending: false }).limit(20),
          ]);
          if (listingResult.error) throw listingResult.error;
          if (requestResult.error) throw requestResult.error;
          const productNames = new Map((productsResult.data ?? []).map(p => [p.id, [p.brand, p.name, p.model].filter(Boolean).join(" ")] as const));
          if (!active) return;
          setOwnListings((listingResult.data ?? []).map(row => ({ ...row, product_name: productNames.get(row.product_id) ?? "Catalogue product" })) as SellerListing[]);
          setOwnRequests((requestResult.data ?? []) as ProductRequest[]);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load your seller workspace.");
      } finally { if (active) setLoading(false); }
    }
    loadWorkspace();
    return () => { active = false; };
  }, [user]);

  async function saveStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !supabase) return;
    if (verificationFile) {
      const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!allowed.includes(verificationFile.type) || verificationFile.size > 10 * 1024 * 1024) {
        setError("Verification files must be JPG, PNG, WebP or PDF and no larger than 10 MB.");
        setMessage("");
        return;
      }
    }
    setBusy(true); setError(""); setMessage("");
    try {
      let saved = store;
      if (!saved) {
        const { data, error: createError } = await supabase.from("seller_stores").insert({
          owner_id: user.id, store_name: storeForm.store_name.trim(), description: storeForm.description.trim() || null,
          city: storeForm.city.trim(), area: storeForm.area.trim() || null,
        }).select("id,store_name,description,city,area,verification_status,verification_level,is_open").single();
        if (createError) throw createError;
        saved = data as Store;
        setStore(saved);
      } else {
        const { error: updateError } = await supabase.from("seller_stores").update({
          store_name: storeForm.store_name.trim(), description: storeForm.description.trim() || null,
          city: storeForm.city.trim(), area: storeForm.area.trim() || null,
        }).eq("id", saved.id);
        if (updateError) throw updateError;
      }
      const { error: contactError } = await supabase.from("seller_store_contacts").upsert({
        store_id: saved.id, contact_phone: storeForm.contact_phone.trim() || null,
        whatsapp_number: storeForm.whatsapp_number.trim() || null,
      }, { onConflict: "store_id" });
      if (contactError) throw contactError;
      if (verificationFile) {
        const extension = verificationFile.name.split(".").pop()?.toLowerCase() || "file";
        const path = user.id + "/" + saved.id + "/business/" + crypto.randomUUID() + "." + extension;
        const { error: uploadError } = await supabase.storage.from("verification-documents").upload(path, verificationFile, { contentType: verificationFile.type, upsert: false });
        if (uploadError) throw uploadError;
        const { error: evidenceError } = await supabase.from("seller_verification_records").insert({ store_id: saved.id, submitted_by: user.id, verification_type: "business", evidence_storage_path: path, evidence_mime_type: verificationFile.type });
        if (evidenceError) { await supabase.storage.from("verification-documents").remove([path]); throw evidenceError; }
        const [storeRefresh, verificationRefresh] = await Promise.all([
          supabase.from("seller_stores").select("id,store_name,description,city,area,verification_status,verification_level,is_open").eq("id", saved.id).single(),
          supabase.from("seller_verification_records").select("id,verification_type,verification_status,created_at").eq("store_id", saved.id).order("created_at", { ascending: false }).limit(10),
        ]);
        if (storeRefresh.error) throw storeRefresh.error;
        if (verificationRefresh.error) throw verificationRefresh.error;
        setStore(storeRefresh.data as Store);
        setVerificationRecords((verificationRefresh.data ?? []) as VerificationRecord[]);
        setVerificationFile(null);
      }
      setMessage("Your store details have been saved. Verification remains subject to EZPREZZ review.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your store details could not be saved.");
    } finally { setBusy(false); }
  }

  async function createListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !store || !supabase) return;
    const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
    const invalidImage = listingImages.find(file => !allowedImageTypes.includes(file.type) || file.size > 5 * 1024 * 1024);
    if (invalidImage) {
      setError("Listing photos must be JPG, PNG or WebP and no larger than 5 MB each.");
      setMessage("");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const { data: createdListing, error: insertError } = await supabase.from("listings").insert({
        seller_store_id: store.id, product_id: listingForm.product_id,
        variant_label: listingForm.variant_label.trim() || null, item_condition: listingForm.item_condition,
        asking_price: Number(listingForm.asking_price), quantity: Number(listingForm.quantity),
        city: listingForm.city.trim(), area: listingForm.area.trim() || null,
        notes: listingForm.notes.trim() || null, moderation_status: "review_required",
      }).select("id,product_id,asking_price,item_condition,variant_label,quantity,city,area,notes,is_active,moderation_status,created_at").single();
      if (insertError) throw insertError;
      const selectedProduct = catalogue.find(product => product.id === listingForm.product_id);
      setOwnListings(current => [{ ...createdListing, product_name: selectedProduct ? [selectedProduct.brand, selectedProduct.name, selectedProduct.model].filter(Boolean).join(" ") : "Catalogue product" } as SellerListing, ...current]);
      let uploadedCount = 0;
      let imageWarning = "";
      for (const [index, file] of listingImages.entries()) {
        const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = user.id + "/" + createdListing.id + "/" + crypto.randomUUID() + "." + extension;
        const { error: uploadError } = await supabase.storage.from("listing-images").upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) { imageWarning = uploadError.message; break; }
        const { error: imageError } = await supabase.from("listing_images").insert({ listing_id: createdListing.id, uploaded_by: user.id, storage_path: path, alt_text: selectedProduct?.name ?? "Seller listing image", sort_order: index });
        if (imageError) { await supabase.storage.from("listing-images").remove([path]); imageWarning = imageError.message; break; }
        uploadedCount += 1;
      }
      setListingImages([]);
      setListingForm({ product_id: "", variant_label: "", item_condition: "new", asking_price: "", quantity: "1", city: store.city, area: store.area ?? "", notes: "" });
      setMessage("Listing submitted with " + uploadedCount + " image(s)." + (imageWarning ? " Some photos could not be uploaded: " + imageWarning : "") + " It will remain private until store verification and listing review are complete.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Listing could not be submitted.");
    } finally { setBusy(false); }
  }

  function beginEdit(item: SellerListing) {
    setEditingId(item.id);
    setEditForm({ variant_label: item.variant_label ?? "", item_condition: item.item_condition, asking_price: String(item.asking_price), quantity: String(item.quantity), city: item.city, area: item.area ?? "", notes: item.notes ?? "" });
  }

  async function saveListingEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !editingId) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const { error: updateError } = await supabase.from("listings").update({
        variant_label: editForm.variant_label.trim() || null, item_condition: editForm.item_condition,
        asking_price: Number(editForm.asking_price), quantity: Number(editForm.quantity),
        city: editForm.city.trim(), area: editForm.area.trim() || null, notes: editForm.notes.trim() || null,
      }).eq("id", editingId);
      if (updateError) throw updateError;
      setOwnListings(current => current.map(item => item.id === editingId ? { ...item, ...editForm, asking_price: Number(editForm.asking_price), quantity: Number(editForm.quantity), variant_label: editForm.variant_label.trim() || null, area: editForm.area.trim() || null, notes: editForm.notes.trim() || null } : item));
      setEditingId("");
      setMessage("Listing details updated. Any required re-review remains subject to moderation.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Listing details could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function deactivateListing(id: string) {
    if (!supabase || !window.confirm("Deactivate this listing? It will no longer appear in the public marketplace.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const { error: updateError } = await supabase.from("listings").update({ is_active: false }).eq("id", id);
      if (updateError) throw updateError;
      setOwnListings(current => current.map(item => item.id === id ? { ...item, is_active: false } : item));
      setMessage("Listing deactivated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Listing could not be deactivated.");
    } finally {
      setBusy(false);
    }
  }

  async function requestProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !supabase) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const { error: requestError } = await supabase.from("product_requests").insert({
        requested_by: user.id, requested_name: requestForm.requested_name.trim(),
        brand: requestForm.brand.trim() || null, model: requestForm.model.trim() || null,
        product_type: requestForm.product_type, category_id: requestForm.category_id || null,
        compatibility_notes: requestForm.compatibility_notes.trim() || null,
        request_status: "pending",
      });
      if (requestError) throw requestError;
      setRequestForm({ requested_name: "", brand: "", model: "", product_type: "finished_product", category_id: "", compatibility_notes: "" });
      setOwnRequests(current => [{ id: crypto.randomUUID(), requested_name: requestForm.requested_name.trim(), brand: requestForm.brand.trim() || null, model: requestForm.model.trim() || null, request_status: "pending", created_at: new Date().toISOString() }, ...current]);
      setMessage("Product request submitted for catalogue review. You can create a listing after it is accepted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Product request could not be submitted.");
    } finally { setBusy(false); }
  }

  if (!user) return <div className="empty">Sign in with your EZPREZZ account to register your store, manage listings and request products for the catalogue. Use the Sign in button at the top of the page.</div>;
  if (loading) return <div className="empty">Loading your seller workspace…</div>;

  return <div className="seller-workspace">
    {error && <p className="account-error" role="alert">{error}</p>}
    {message && <p className="seller-success" role="status">{message}</p>}
    <section className="formcard">
      <div className="eyebrow">SELLER PROFILE</div>
      <h3>{store ? "Your store" : "Register your store"}</h3>
      {store && <p className="store-status">Business verification: <b>{store.verification_status.replaceAll("_", " ")}</b> · Account level: {store.verification_level.replaceAll("_", " ")}</p>}
      {store?.verification_status === "rejected" && <p className="account-error">Your previous business evidence was rejected. You can submit a new document below to re-enter the review queue.</p>}
      {store && verificationRecords.length > 0 && <div className="verification-history"><b>Business evidence history</b>{verificationRecords.map(record => <div key={record.id}><span>{record.verification_type.replaceAll("_", " ")}</span><strong className={"listing-status status-" + record.verification_status}>{record.verification_status.replaceAll("_", " ")}</strong><small>{new Date(record.created_at).toLocaleDateString("en-NG")}</small></div>)}</div>}
      <form onSubmit={saveStore}>
        <div className="formgrid">
          <label>Store name<input required maxLength={100} value={storeForm.store_name} onChange={e => setStoreForm({ ...storeForm, store_name: e.target.value })} placeholder="Your shop or business name" /></label>
          <label>City<input required maxLength={80} value={storeForm.city} onChange={e => setStoreForm({ ...storeForm, city: e.target.value })} /></label>
          <label>Area / neighbourhood<input maxLength={100} value={storeForm.area} onChange={e => setStoreForm({ ...storeForm, area: e.target.value })} placeholder="e.g. Mile 1" /></label>
          <label>Phone number<input type="tel" value={storeForm.contact_phone} onChange={e => setStoreForm({ ...storeForm, contact_phone: e.target.value })} placeholder="Your business phone" /></label>
          <label>WhatsApp number<input type="tel" value={storeForm.whatsapp_number} onChange={e => setStoreForm({ ...storeForm, whatsapp_number: e.target.value })} placeholder="Include country code if possible" /></label>
          <label>Store description<input maxLength={500} value={storeForm.description} onChange={e => setStoreForm({ ...storeForm, description: e.target.value })} placeholder="What do you sell or specialise in?" /></label>
          <label>Business verification document<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => setVerificationFile(e.target.files?.[0] ?? null)} /><small>Private upload · JPG, PNG, WebP or PDF · max 10 MB</small></label>
        </div>
        <button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : store ? "Save store details" : "Register store"}</button>
      </form>
    </section>

    {store && <section className="formcard">
      <div className="eyebrow">YOUR INVENTORY</div><h3>Create a listing</h3>
      {catalogue.length ? <form onSubmit={createListing}>
        <div className="formgrid">
          <label>Catalogue product<select required value={listingForm.product_id} onChange={e => setListingForm({ ...listingForm, product_id: e.target.value })}><option value="">Choose a product</option>{catalogue.map(p => <option key={p.id} value={p.id}>{[p.brand, p.name, p.model].filter(Boolean).join(" ")}</option>)}</select></label>
          <label>Variant / specifications<input value={listingForm.variant_label} onChange={e => setListingForm({ ...listingForm, variant_label: e.target.value })} placeholder="e.g. 8GB / 256GB" /></label>
          <label>Condition<select value={listingForm.item_condition} onChange={e => setListingForm({ ...listingForm, item_condition: e.target.value })}>{conditions.map(v => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select></label>
          <label>Asking price (NGN)<input required type="number" min="1" step="1" value={listingForm.asking_price} onChange={e => setListingForm({ ...listingForm, asking_price: e.target.value })} /></label>
          <label>Quantity<input required type="number" min="0" step="1" value={listingForm.quantity} onChange={e => setListingForm({ ...listingForm, quantity: e.target.value })} /></label>
          <label>City<input required value={listingForm.city} onChange={e => setListingForm({ ...listingForm, city: e.target.value })} /></label>
          <label>Area<input value={listingForm.area} onChange={e => setListingForm({ ...listingForm, area: e.target.value })} /></label>
          <label>Additional details<input value={listingForm.notes} onChange={e => setListingForm({ ...listingForm, notes: e.target.value })} /></label>
          <label>Product photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { const files = Array.from(e.target.files ?? []); if (files.length > 5 || files.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)) { setError("Choose up to 5 JPG, PNG or WebP images, each no larger than 5 MB."); setListingImages([]); return; } setError(""); setListingImages(files); }} /><small>{listingImages.length} of 5 photos selected · max 5 MB each</small></label>
        </div>
        <button className="primary" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit listing for review"}</button>
        <p className="muted">Your asking price is displayed separately from PriceCheck market ranges.</p>
      </form> : <p className="muted">The catalogue currently has no active products. Request a missing product below; once the catalogue team accepts it, it will become available here.</p>}
    </section>}

    {store && <section className="formcard seller-listings">
      <div className="eyebrow">INVENTORY OVERVIEW</div><h3>Your listings <span className="count-pill">{ownListings.length}</span></h3>
      {ownListings.length ? <div className="seller-listing-list">{ownListings.map(item => <article className="seller-listing-row seller-listing-editable" key={item.id}><div><b>{item.product_name}</b><small>{item.variant_label ? item.variant_label + " · " : ""}{item.item_condition.replaceAll("_", " ")}</small><span className={"listing-status " + (item.is_active ? "status-" + item.moderation_status : "")}>{item.is_active ? item.moderation_status.replaceAll("_", " ") : "deactivated"}</span></div><div className="seller-listing-meta"><strong>₦{Number(item.asking_price).toLocaleString("en-NG")}</strong><div><button className="secondary-action" disabled={busy} onClick={() => beginEdit(item)}>Edit</button>{item.is_active && <button className="secondary-action" disabled={busy} onClick={() => deactivateListing(item.id)}>Deactivate</button>}</div></div>{editingId === item.id && <form className="seller-edit-form" onSubmit={saveListingEdits}><label>Variant<input value={editForm.variant_label} onChange={e => setEditForm({ ...editForm, variant_label: e.target.value })}/></label><label>Condition<select value={editForm.item_condition} onChange={e => setEditForm({ ...editForm, item_condition: e.target.value })}>{conditions.map(v => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select></label><label>Price (NGN)<input type="number" min="1" step="1" required value={editForm.asking_price} onChange={e => setEditForm({ ...editForm, asking_price: e.target.value })}/></label><label>Quantity<input type="number" min="0" step="1" required value={editForm.quantity} onChange={e => setEditForm({ ...editForm, quantity: e.target.value })}/></label><label>City<input required value={editForm.city} onChange={e => setEditForm({ ...editForm, city: e.target.value })}/></label><label>Area<input value={editForm.area} onChange={e => setEditForm({ ...editForm, area: e.target.value })}/></label><label>Details<input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })}/></label><div><button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button><button className="secondary-action" type="button" onClick={() => setEditingId("")}>Cancel</button></div></form>}</article>)}</div> : <p className="muted">You have not submitted any listings yet.</p>}
    </section>}

    {ownRequests.length > 0 && <section className="formcard seller-listings"><div className="eyebrow">REQUEST TRACKER</div><h3>Your product requests <span className="count-pill">{ownRequests.length}</span></h3><div className="seller-listing-list">{ownRequests.map(request => <article className="seller-listing-row" key={request.id}><div><b>{[request.brand, request.requested_name, request.model].filter(Boolean).join(" ")}</b><small>{new Date(request.created_at).toLocaleDateString("en-NG")}</small></div><span className={"listing-status status-" + request.request_status}>{request.request_status.replaceAll("_", " ")}</span></article>)}</div></section>}

    <section className="formcard">
      <div className="eyebrow">CATALOGUE REQUEST</div><h3>Request a missing product</h3>
      <form onSubmit={requestProduct}>
        <div className="formgrid">
          <label>Product name<input required maxLength={160} value={requestForm.requested_name} onChange={e => setRequestForm({ ...requestForm, requested_name: e.target.value })} placeholder="Product name" /></label>
          <label>Brand<input value={requestForm.brand} onChange={e => setRequestForm({ ...requestForm, brand: e.target.value })} /></label>
          <label>Model / part number<input value={requestForm.model} onChange={e => setRequestForm({ ...requestForm, model: e.target.value })} /></label>
          <label>Product type<select value={requestForm.product_type} onChange={e => setRequestForm({ ...requestForm, product_type: e.target.value })}>{productTypes.map(v => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select></label>
          <label>Category<select value={requestForm.category_id} onChange={e => setRequestForm({ ...requestForm, category_id: e.target.value })}><option value="">Choose category (optional)</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Compatibility / notes<input value={requestForm.compatibility_notes} onChange={e => setRequestForm({ ...requestForm, compatibility_notes: e.target.value })} /></label>
        </div>
        <button className="primary" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit product request"}</button>
      </form>
    </section>
  </div>;
}
