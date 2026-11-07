"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type QueueStore = { id: string; store_name: string; description: string | null; city: string; area: string | null; verification_status: string; verification_level: string; created_at: string; businessEvidence: { mimeType: string | null; createdAt: string; signedUrl: string | null } | null };
type QueueListing = { id: string; product_name: string; store_name: string; variant_label: string | null; item_condition: string; asking_price: number; quantity: number; city: string; area: string | null; notes: string | null; moderation_status: string; price_flag_status: string; price_flag_reason: string | null; created_at: string };
type QueuePrice = { id: string; product_name: string; variant_label: string | null; item_condition: string; amount_value: number; city: string; area: string | null; source_type: string; source_description: string | null; evidence_url: string | null; evidenceFiles: { mimeType: string | null; createdAt: string; signedUrl: string | null }[]; observed_on: string; is_duplicate: boolean; is_price_outlier: boolean; created_at: string };
type QueueRequest = { id: string; requested_name: string; brand: string | null; model: string | null; product_type: string; category_id: string | null; category_name: string | null; compatibility_notes: string | null; created_at: string };
type QueueCategory = { id: string; name: string };
type Queues = { stores: QueueStore[]; listings: QueueListing[]; priceObservations: QueuePrice[]; productRequests: QueueRequest[] };
const emptyQueues: Queues = { stores: [], listings: [], priceObservations: [], productRequests: [] };
const money = (value: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);

export default function AdminDashboard({ user, active, onAccessChange, categories }: { user: User | null; active: boolean; onAccessChange: (allowed: boolean) => void; categories: QueueCategory[] }) {
  const [queues, setQueues] = useState<Queues>(emptyQueues);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [priceFlagOverrides, setPriceFlagOverrides] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("All");

  const load = useCallback(async (quiet = false) => {
    if (!user || !supabase) { setQueues(emptyQueues); setRoles([]); onAccessChange(false); return; }
    if (!quiet) setLoading(true);
    setError("");
    const { data, error: invokeError } = await supabase.functions.invoke("admin-dashboard", { method: "GET" });
    if (invokeError) {
      let detail = invokeError.message;
      try { const body = await (invokeError as any).context?.json?.(); if (body?.error) detail = body.error; } catch {}
      setQueues(emptyQueues); setRoles([]); onAccessChange(false);
      setError(detail || "Administrator access could not be verified.");
    } else if (data?.queues) {
      setQueues(data.queues as Queues);
      setRoles(Array.isArray(data.roles) ? data.roles : []);
      onAccessChange(true);
    } else {
      setQueues(emptyQueues); setRoles([]); onAccessChange(false);
      setError("The moderation service returned an unexpected response.");
    }
    if (!quiet) setLoading(false);
  }, [user, onAccessChange]);

  useEffect(() => { load(); }, [load]);

  async function review(functionName: string, body: Record<string, unknown>, id: string, successText: string) {
    if (!supabase) return;
    setBusyId(id); setError(""); setNotice("");
    const { data, error: invokeError } = await supabase.functions.invoke(functionName, { body });
    if (invokeError || data?.error || data?.success === false) {
      let detail = data?.error || invokeError?.message || "The review action could not be completed.";
      if (invokeError) { try { const payload = await (invokeError as any).context?.json?.(); if (payload?.error) detail = payload.error; } catch {} }
      setError(detail);
    } else {
      setNotice(successText);
      await load(true);
    }
    setBusyId("");
  }

  const total = queues.stores.length + queues.listings.length + queues.priceObservations.length + queues.productRequests.length;
  const visible = filter === "All" ? ["Stores", "Listings", "PriceCheck", "Product requests"] : [filter];

  if (!user) return active ? <div className="empty">Sign in with an administrator account to access moderation.</div> : null;
  if (!active) return null;

  return <section className="admin-workspace">
    <div className="admin-heading"><div><div className="eyebrow">CONTROL CENTRE</div><h2>Moderation dashboard</h2><p className="muted">Protected review queues · Changes are recorded in the moderation audit trail.</p></div><button className="secondary-action" onClick={() => load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh queues"}</button></div>
    <div className="admin-summary"><div><strong>{total}</strong><span>Pending items</span></div><div><strong>{queues.stores.length}</strong><span>Stores</span></div><div><strong>{queues.listings.length}</strong><span>Listings</span></div><div><strong>{queues.priceObservations.length}</strong><span>Price reports</span></div><div><strong>{queues.productRequests.length}</strong><span>Product requests</span></div></div>
    <div className="admin-roleline">Your permissions: {roles.map(role => <span key={role} className="admin-role">{role.replaceAll("_", " ")}</span>)}</div>
    {error && <p className="account-error" role="alert">{error}</p>}
    {notice && <p className="seller-success" role="status">{notice}</p>}
    <div className="admin-filters">{["All", "Stores", "Listings", "PriceCheck", "Product requests"].map(name => <button key={name} className={filter === name ? "chosen" : ""} onClick={() => setFilter(name)}>{name}</button>)}</div>
    {loading ? <div className="empty">Loading protected moderation queues…</div> : <>
      {visible.includes("Stores") && <section className="admin-queue"><div className="admin-queue-title"><div><div className="eyebrow">SELLER VERIFICATION</div><h3>Stores awaiting review <span className="count-pill">{queues.stores.length}</span></h3></div></div>
        {queues.stores.length ? queues.stores.map(store => <article className="admin-item" key={store.id}><div className="admin-item-main"><b>{store.store_name}</b><small>{[store.area, store.city].filter(Boolean).join(", ")} · {store.verification_level.replaceAll("_", " ")}</small>{store.description && <p>{store.description}</p>}{store.businessEvidence?.signedUrl ? <a href={store.businessEvidence.signedUrl} target="_blank" rel="noreferrer">Open business verification evidence ↗</a> : <span className="admin-warning">No business verification evidence submitted</span>}</div><div className="admin-item-actions"><input aria-label="Store review note" placeholder="Optional review note" value={notes[store.id] ?? ""} onChange={e => setNotes({ ...notes, [store.id]: e.target.value })}/><div><button className="primary" disabled={!!busyId || !store.businessEvidence?.signedUrl} onClick={() => review("admin-review-store", { store_id: store.id, decision: "approve_business", review_notes: notes[store.id] ?? "" }, store.id, "Store verified.")}>Verify business</button><button className="secondary-action" disabled={!!busyId} onClick={() => review("admin-review-store", { store_id: store.id, decision: "reject", review_notes: notes[store.id] ?? "" }, store.id, "Store rejected.")}>Reject</button><button className="secondary-action" disabled={!!busyId} onClick={() => review("admin-review-store", { store_id: store.id, decision: "suspend", review_notes: notes[store.id] ?? "" }, store.id, "Store suspended.")}>Suspend</button></div></div></article>) : <p className="muted">No stores are awaiting review.</p>}
      </section>}
      {visible.includes("Listings") && <section className="admin-queue"><div className="eyebrow">MARKETPLACE MODERATION</div><h3>Listings awaiting review <span className="count-pill">{queues.listings.length}</span></h3>
        {queues.listings.length ? queues.listings.map(item => <article className="admin-item" key={item.id}><div className="admin-item-main"><b>{item.product_name}</b><small>{item.store_name} · {item.item_condition.replaceAll("_", " ")} · {item.city}{item.area ? ", " + item.area : ""}</small><strong>{money(Number(item.asking_price))} · Qty {item.quantity}</strong>{item.notes && <p>{item.notes}</p>}{item.price_flag_status === "review_required" && <p className="admin-warning">Price flag: {item.price_flag_reason || "Requires manual review"}</p>}</div><div className="admin-item-actions"><input aria-label="Listing review reason" placeholder="Optional review reason" value={notes[item.id] ?? ""} onChange={e => setNotes({ ...notes, [item.id]: e.target.value })}/>{item.price_flag_status === "review_required" && <label className="admin-check"><input type="checkbox" checked={!!priceFlagOverrides[item.id]} onChange={e => setPriceFlagOverrides({ ...priceFlagOverrides, [item.id]: e.target.checked })}/> I reviewed and clear this price flag</label>}<div><button className="primary" disabled={!!busyId || (item.price_flag_status === "review_required" && !priceFlagOverrides[item.id])} onClick={() => review("admin-review-listing", { listing_id: item.id, decision: "approved", override_price_flag: !!priceFlagOverrides[item.id], reason: notes[item.id] ?? "" }, item.id, "Listing approved.")}>Approve</button><button className="secondary-action" disabled={!!busyId} onClick={() => review("admin-review-listing", { listing_id: item.id, decision: "rejected", reason: notes[item.id] ?? "" }, item.id, "Listing rejected.")}>Reject</button><button className="secondary-action" disabled={!!busyId} onClick={() => review("admin-review-listing", { listing_id: item.id, decision: "suspended", reason: notes[item.id] ?? "" }, item.id, "Listing suspended.")}>Suspend</button></div></div></article>) : <p className="muted">No listings are awaiting review.</p>}
      </section>}
      {visible.includes("PriceCheck") && <section className="admin-queue"><div className="eyebrow">PRICE INTELLIGENCE</div><h3>Price observations awaiting review <span className="count-pill">{queues.priceObservations.length}</span></h3>
        {queues.priceObservations.length ? queues.priceObservations.map(item => <article className="admin-item" key={item.id}><div className="admin-item-main"><b>{item.product_name}</b><small>{(item.variant_label ? item.variant_label + " · " : "") + item.item_condition.replaceAll("_", " ") + " · " + item.city + (item.area ? ", " + item.area : "") + " · " + item.observed_on}</small><strong>{money(Number(item.amount_value))}</strong><p>{item.source_type.replaceAll("_", " ")} · {item.source_description || "No source details"}</p>{item.is_duplicate && <span className="admin-warning">Possible duplicate</span>} {item.is_price_outlier && <span className="admin-warning">Price outlier</span>}{item.evidence_url && <a href={item.evidence_url} target="_blank" rel="noreferrer">Open submitted evidence link ↗</a>}{item.evidenceFiles?.filter(file => file.signedUrl).map((file, index) => <a key={index} href={file.signedUrl!} target="_blank" rel="noreferrer">Open private evidence {index + 1} ↗</a>)}</div><div className="admin-item-actions"><input aria-label="Price review note" placeholder="Optional review note" value={notes[item.id] ?? ""} onChange={e => setNotes({ ...notes, [item.id]: e.target.value })}/><div><button className="primary" disabled={!!busyId} onClick={() => review("admin-review-price", { observation_id: item.id, decision: "approved", review_notes: notes[item.id] ?? "" }, item.id, "Price observation approved.")}>Approve</button><button className="secondary-action" disabled={!!busyId} onClick={() => review("admin-review-price", { observation_id: item.id, decision: "rejected", review_notes: notes[item.id] ?? "" }, item.id, "Price observation rejected.")}>Reject</button></div></div></article>) : <p className="muted">No price observations are awaiting review.</p>}
      </section>}
      {visible.includes("Product requests") && <section className="admin-queue"><div className="eyebrow">CATALOGUE MANAGEMENT</div><h3>Product requests awaiting review <span className="count-pill">{queues.productRequests.length}</span></h3>
        {queues.productRequests.length ? queues.productRequests.map(item => <article className="admin-item" key={item.id}><div className="admin-item-main"><b>{[item.brand, item.requested_name, item.model].filter(Boolean).join(" ")}</b><small>{item.product_type.replaceAll("_", " ")} · {item.category_name || "No category selected"}</small>{item.compatibility_notes && <p>{item.compatibility_notes}</p>}</div><div className="admin-item-actions">{!item.category_id && <select aria-label="Select catalogue category" value={notes[item.id] ?? ""} onChange={e => setNotes({ ...notes, [item.id]: e.target.value })}><option value="">Choose category to accept</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select> }<div><button className="primary" disabled={!!busyId || (!item.category_id && !notes[item.id])} onClick={() => review("admin-process-product-request", { request_id: item.id, decision: "accept", category_id: item.category_id || notes[item.id] }, item.id, "Product request accepted and catalogue product created.")}>Accept & create product</button><button className="secondary-action" disabled={!!busyId} onClick={() => review("admin-process-product-request", { request_id: item.id, decision: "reject" }, item.id, "Product request rejected.")}>Reject</button></div></div></article>) : <p className="muted">No product requests are awaiting review.</p>}
      </section>}
    </>}
  </section>;
}
