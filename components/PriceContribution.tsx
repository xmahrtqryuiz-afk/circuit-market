"use client";

import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type Product = { id: string; name: string; brand: string | null; model: string | null };
type Report = { id: string; product_id: string; amount_value: number; item_condition: string; review_status: string; observed_on: string; created_at: string };

export default function PriceContribution({ user, onRequestProduct }: { user: User | null; onRequestProduct: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [form, setForm] = useState({ product_id: "", variant_label: "", item_condition: "new", amount_value: "", city: "Port Harcourt", area: "", source_type: "shop_quote", source_description: "", evidence_url: "", observed_on: new Date().toISOString().slice(0, 10) });

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user || !supabase) { setProducts([]); setReports([]); return; }
      setLoading(true); setError("");
      try {
        const [productResult, reportResult] = await Promise.all([
          supabase.from("products").select("id,name,brand,model").eq("is_active", true).order("name").limit(1000),
          supabase.from("price_observations").select("id,product_id,amount_value,item_condition,review_status,observed_on,created_at").eq("submitted_by", user.id).order("created_at", { ascending: false }).limit(12),
        ]);
        if (productResult.error) throw productResult.error;
        if (reportResult.error) throw reportResult.error;
        if (!active) return;
        setProducts((productResult.data ?? []) as Product[]);
        setReports((reportResult.data ?? []) as Report[]);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load your PriceCheck workspace.");
      } finally { if (active) setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [user]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !supabase) return;
    if (evidenceFile) {
      const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!allowed.includes(evidenceFile.type) || evidenceFile.size > 10 * 1024 * 1024) {
        setError("Evidence files must be JPG, PNG, WebP or PDF and no larger than 10 MB.");
        setMessage("");
        return;
      }
    }
    const evidenceUrl = form.evidence_url.trim();
    if (evidenceUrl) {
      try {
        const parsed = new URL(evidenceUrl);
        if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) throw new Error("invalid");
      } catch {
        setError("Evidence links must be valid HTTP or HTTPS URLs.");
        setMessage("");
        return;
      }
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const { data, error: insertError } = await supabase.from("price_observations").insert({
        product_id: form.product_id, submitted_by: user.id, variant_label: form.variant_label.trim() || null,
        item_condition: form.item_condition, amount_value: Number(form.amount_value), city: form.city.trim(),
        area: form.area.trim() || null, source_type: form.source_type,
        source_description: form.source_description.trim(), evidence_url: evidenceUrl || null,
        observed_on: form.observed_on, currency_code: "NGN",
      }).select("id,product_id,amount_value,item_condition,review_status,observed_on,created_at").single();
      if (insertError) throw insertError;
      let evidenceWarning = "";
      if (evidenceFile) {
        const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
        if (!allowed.includes(evidenceFile.type) || evidenceFile.size > 10 * 1024 * 1024) {
          evidenceWarning = " The report was saved, but the evidence file must be JPG, PNG, WebP or PDF and no larger than 10 MB.";
        } else {
          const extension = evidenceFile.name.split(".").pop()?.toLowerCase() || "file";
          const path = user.id + "/" + data.id + "/" + crypto.randomUUID() + "." + extension;
          const { error: uploadError } = await supabase.storage.from("price-evidence").upload(path, evidenceFile, { contentType: evidenceFile.type, upsert: false });
          if (uploadError) evidenceWarning = " The report was saved, but the evidence upload failed: " + uploadError.message;
          else {
            const { error: evidenceError } = await supabase.from("price_observation_evidence").insert({ observation_id: data.id, uploaded_by: user.id, storage_path: path, mime_type: evidenceFile.type });
            if (evidenceError) { await supabase.storage.from("price-evidence").remove([path]); evidenceWarning = " The report was saved, but its evidence record could not be attached: " + evidenceError.message; }
          }
        }
      }
      setReports(current => [data as Report, ...current]);
      setForm({ product_id: "", variant_label: "", item_condition: "new", amount_value: "", city: "Port Harcourt", area: "", source_type: "shop_quote", source_description: "", evidence_url: "", observed_on: new Date().toISOString().slice(0, 10) });
      setEvidenceFile(null);
      setMessage("Your price observation has been submitted for review. It will not affect public PriceCheck ranges unless approved and eligible." + evidenceWarning);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Price observation could not be submitted.");
    } finally { setBusy(false); }
  }

  if (!user) return <section className="formcard"><div className="eyebrow">CONTRIBUTE TO PRICECHECK</div><h3>Share a real price observation</h3><p className="muted">Sign in to submit a price observation. All reports are reviewed before they can influence published ranges.</p></section>;
  if (loading) return <div className="empty">Loading your PriceCheck workspace…</div>;

  const visibleProducts = products.filter(product => product.id === form.product_id || [product.name, product.brand, product.model].filter(Boolean).join(" ").toLowerCase().includes(productSearch.trim().toLowerCase()));

  const productName = (id: string) => {
    const product = products.find(item => item.id === id);
    return product ? [product.brand, product.name, product.model].filter(Boolean).join(" ") : "Catalogue product";
  };

  return <div className="price-contribution">
    {error && <p className="account-error" role="alert">{error}</p>}
    {message && <p className="seller-success" role="status">{message}</p>}
    <section className="formcard">
      <div className="eyebrow">CONTRIBUTE TO PRICE INTELLIGENCE</div><h3>Submit a price observation</h3>
      {products.length ? <form onSubmit={submit}>
        <div className="formgrid">
          <label>Find a product<input type="search" value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search name, brand or model…" /></label>
          <label>Product<select required value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })}><option value="">Choose a catalogue product ({visibleProducts.length} matches)</option>{visibleProducts.map(p => <option key={p.id} value={p.id}>{[p.brand, p.name, p.model].filter(Boolean).join(" ")}</option>)}</select></label>
          {!visibleProducts.length && <p className="muted">No catalogue products match this search. Request the missing product from the Sell tab.</p>}
          <label>Variant / specifications<input value={form.variant_label} onChange={e => setForm({ ...form, variant_label: e.target.value })} placeholder="Exact model, storage, part code…" /></label>
          <label>Condition<select value={form.item_condition} onChange={e => setForm({ ...form, item_condition: e.target.value })}>{["new", "used", "refurbished", "new_aftermarket", "used_salvaged"].map(v => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select></label>
          <label>Observed price (NGN)<input required type="number" min="1" step="1" value={form.amount_value} onChange={e => setForm({ ...form, amount_value: e.target.value })} /></label>
          <label>City<input required value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></label>
          <label>Area / neighbourhood<input value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} /></label>
          <label>Source type<select value={form.source_type} onChange={e => setForm({ ...form, source_type: e.target.value })}>{["shop_quote", "retail_listing", "receipt", "purchase", "other"].map(v => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select></label>
          <label>Date observed<input required type="date" value={form.observed_on} onChange={e => setForm({ ...form, observed_on: e.target.value })} /></label>
          <label>Source details<input required maxLength={500} value={form.source_description} onChange={e => setForm({ ...form, source_description: e.target.value })} placeholder="Where and how was this price confirmed?" /></label>
          <label>Evidence link (optional)<input type="url" value={form.evidence_url} onChange={e => setForm({ ...form, evidence_url: e.target.value })} placeholder="Link to a public listing or evidence" /></label>
          <label>Private evidence file (optional)<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => setEvidenceFile(e.target.files?.[0] ?? null)} /><small>Private to you and authorised reviewers · JPG, PNG, WebP or PDF · max 10 MB</small></label>
        </div>
        <button className="primary" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit for review"}</button>
        <p className="muted">Submit only prices you actually observed. Your report stays pending until reviewed and never becomes a public range automatically.</p>
      </form> : <div className="empty">There are no active products in the catalogue yet. Request the missing product from the Sell tab; price reporting becomes available when it is added to the catalogue.<button className="textbutton" onClick={onRequestProduct}>Go to product requests →</button></div>}
    </section>
    <section className="formcard">
      <div className="eyebrow">YOUR CONTRIBUTIONS</div><h3>Recent observations</h3>
      {reports.length ? <div className="seller-listing-list">{reports.map(report => <article className="seller-listing-row" key={report.id}><div><b>{productName(report.product_id)}</b><small>{report.item_condition.replaceAll("_", " ")} · {report.observed_on}</small></div><div className="seller-listing-meta"><strong>₦{Number(report.amount_value).toLocaleString("en-NG")}</strong><span className={"listing-status status-" + report.review_status}>{report.review_status}</span></div></article>)}</div> : <p className="muted">You have not submitted any observations yet.</p>}
    </section>
  </div>;
}
