"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type ProductOption = { productId: string; name: string; brand: string | null; model: string | null };
type Deal = {
  id: string; listing_id: string; store_id: string; buyer_id: string;
  buyer_confirmed_at: string; seller_confirmed_at: string | null;
  deal_status: "pending" | "confirmed" | "disputed" | "cancelled"; created_at: string;
};
type Store = { id: string; store_name: string; owner_id?: string };
type Listing = { id: string; product_id: string; asking_price: number; item_condition: string; variant_label: string | null };
type Review = { id: string; deal_id: string; review_type: "seller" | "product"; rating: number; review_text: string | null; review_status: string };

const money = (amount: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount);

export default function MarketplaceActivity({ user, products }: { user: User | null; products: ProductOption[] }) {
  const lastActivityUserId = useRef<string | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [listings, setListings] = useState<Record<string, Listing>>({});
  const [reviews, setReviews] = useState<Review[]>([]);
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [compatPart, setCompatPart] = useState("");
  const [compatTarget, setCompatTarget] = useState("");
  const [compatType, setCompatType] = useState("fits");
  const [compatNotes, setCompatNotes] = useState("");
  const [catalogueProducts, setCatalogueProducts] = useState<ProductOption[]>(products);

  const uniqueProducts = useMemo(() => Array.from(new Map(catalogueProducts.map(p => [p.productId, p])).values()), [catalogueProducts]);
  const productMap = useMemo(() => new Map(uniqueProducts.map(p => [p.productId, p])), [uniqueProducts]);
  const storeMap = useMemo(() => new Map(stores.map(s => [s.id, s])), [stores]);

  const loadActivity = useCallback(async () => {
    const nextUserId = user?.id ?? null;
    if (lastActivityUserId.current !== nextUserId) {
      lastActivityUserId.current = nextUserId;
      setDeals([]); setStores([]); setListings({}); setReviews([]);
      setCompatPart(""); setCompatTarget(""); setCompatType("fits"); setCompatNotes("");
      setMessage(""); setError("");
    }
    if (!supabase || !user) { setDeals([]); setStores([]); setListings({}); setReviews([]); setLoading(false); return; }
    setLoading(true); setError("");
    const storeResult = await supabase.from("seller_stores").select("id,store_name,owner_id").eq("owner_id", user.id);
    if (storeResult.error) { setError(storeResult.error.message); setLoading(false); return; }
    const ownStores = (storeResult.data ?? []) as Store[];
    const storeIds = ownStores.map(s => s.id);
    let dealQuery = supabase.from("deal_confirmations")
      .select("id,listing_id,store_id,buyer_id,buyer_confirmed_at,seller_confirmed_at,deal_status,created_at")
      .order("created_at", { ascending: false }).limit(100);
    dealQuery = storeIds.length
      ? dealQuery.or(`buyer_id.eq.${user.id},store_id.in.(${storeIds.join(",")})`)
      : dealQuery.eq("buyer_id", user.id);
    const dealResult = await dealQuery;
    if (dealResult.error) { setError(dealResult.error.message); setLoading(false); return; }
    const nextDeals = (dealResult.data ?? []) as Deal[];
    setDeals(nextDeals);
    const listingIds = [...new Set(nextDeals.map(d => d.listing_id))];
    if (listingIds.length) {
      const listingResult = await supabase.from("listings").select("id,product_id,asking_price,item_condition,variant_label").in("id", listingIds);
      if (!listingResult.error) setListings(Object.fromEntries(((listingResult.data ?? []) as Listing[]).map(l => [l.id, l])));
      else { setListings({}); setError(listingResult.error.message); }
    } else setListings({});
    const dealIds = nextDeals.filter(d => d.buyer_id === user.id && d.deal_status === "confirmed").map(d => d.id);
    if (dealIds.length) {
      const reviewResult = await supabase.from("marketplace_reviews")
        .select("id,deal_id,review_type,rating,review_text,review_status").in("deal_id", dealIds);
      if (!reviewResult.error) setReviews((reviewResult.data ?? []) as Review[]);
      else setReviews([]);
    } else setReviews([]);
    setLoading(false);
  }, [user]);

  useEffect(() => { void loadActivity(); }, [loadActivity]);

  useEffect(() => {
    let active = true;
    if (!supabase) return;
    void supabase.from("products").select("id,name,brand,model")
      .eq("is_active", true).order("name").limit(500)
      .then(({ data, error }) => {
        if (!active || error || !data) return;
        setCatalogueProducts(data.map(product => ({
          productId: product.id, name: product.name, brand: product.brand ?? null, model: product.model ?? null,
        })));
      });
    return () => { active = false; };
  }, []);

  async function confirmSeller(deal: Deal) {
    if (!supabase || !user) return;
    setBusy(deal.id); setError(""); setMessage("");
    try {
      const { data: updatedDeal, error: updateError } = await supabase.from("deal_confirmations")
        .update({ seller_confirmed_at: new Date().toISOString() })
        .eq("id", deal.id).eq("store_id", deal.store_id).eq("deal_status", "pending")
        .select("id").maybeSingle();
      if (updateError) setError(updateError.message);
      else if (!updatedDeal) setError("This deal could not be confirmed. It may have already changed or your account may not own the seller store.");
      else { setMessage("Your confirmation was recorded. The deal is confirmed when both sides have confirmed."); await loadActivity(); }
    } catch (error) {
      setError(error instanceof Error ? error.message : "The deal confirmation could not be completed.");
    } finally {
      setBusy("");
    }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>, deal: Deal, type: "seller" | "product") {
    event.preventDefault();
    if (!supabase || !user) return;
    const form = new FormData(event.currentTarget);
    const rating = Number(form.get("rating"));
    const reviewText = String(form.get("review_text") ?? "").trim();
    const listing = listings[deal.listing_id];
    if (type === "product" && !listing?.product_id) { setError("The product details for this historical listing are unavailable."); return; }
    setBusy(`${deal.id}-${type}`); setError(""); setMessage("");
    const payload = {
      deal_id: deal.id, reviewer_id: user.id, review_type: type, rating,
      review_text: reviewText || null,
      store_id: type === "seller" ? deal.store_id : null,
      product_id: type === "product" ? listing.product_id : null,
    };
    const { error: insertError } = await supabase.from("marketplace_reviews").insert(payload);
    if (insertError) setError(insertError.code === "23505" ? "You have already submitted this review." : insertError.message);
    else { setMessage(`${type === "seller" ? "Seller" : "Product"} review submitted for moderation.`); await loadActivity(); }
    setBusy("");
  }

  async function submitCompatibility(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user) return;
    if (!compatPart || !compatTarget || compatPart === compatTarget) { setError("Choose two different catalogue products."); return; }
    setBusy("compatibility"); setError(""); setMessage("");
    const { error: insertError } = await supabase.from("product_compatibilities").insert({
      part_product_id: compatPart, compatible_product_id: compatTarget,
      compatibility_type: compatType, notes: compatNotes.trim() || null, submitted_by: user.id,
    });
    if (insertError) setError(insertError.code === "23505" ? "That compatibility suggestion has already been submitted." : insertError.message);
    else { setMessage("Compatibility suggestion submitted for catalogue review."); setCompatNotes(""); }
    setBusy("");
  }

  if (!user) return <section className="activity-panel"><h3>Your marketplace activity</h3><p>Sign in to manage deal confirmations, submit reviews and suggest product compatibility.</p></section>;

  return <section className="activity-wrap">
    <div className="sectionhead"><div><div className="eyebrow">BUYER & SELLER ACCOUNT</div><h2>My activity</h2><p className="muted">Confirm completed purchases, manage deal status and contribute trusted product information.</p></div><button className="filter-reset" onClick={() => void loadActivity()}>Refresh</button></div>
    {error && <p className="account-error" role="alert">{error}</p>}
    {message && <p className="account-status" role="status">{message}</p>}
    <section className="activity-panel">
      <h3>Deal confirmations</h3>
      <p className="muted">A deal is confirmed only after the buyer and seller both confirm. This does not process payment or arrange delivery.</p>
      {loading ? <p className="empty">Loading your activity…</p> : !deals.length ? <p className="empty">No deal confirmations yet. Open an approved listing and confirm your purchase interest to start one.</p> :
        <div className="activity-list">{deals.map(deal => {
          const listing = listings[deal.listing_id];
          const product = listing ? productMap.get(listing.product_id) : undefined;
          const ownStore = storeMap.get(deal.store_id);
          const buyer = deal.buyer_id === user.id;
          const existingSellerReview = reviews.find(r => r.deal_id === deal.id && r.review_type === "seller");
          const existingProductReview = reviews.find(r => r.deal_id === deal.id && r.review_type === "product");
          return <article className="activity-card" key={deal.id}>
            <div className="activity-card-head"><div><b>{product?.name || "Marketplace listing"}</b><small>{ownStore?.store_name || "Seller store"} · {listing?.variant_label || listing?.item_condition || "Listing"}</small></div><span className={`activity-status ${deal.deal_status}`}>{deal.deal_status.replaceAll("_", " ")}</span></div>
            {listing && <p className="muted">{money(Number(listing.asking_price))}</p>}
            <div className="activity-meta"><span>{buyer ? "You are the buyer" : "Your store is the seller"}</span><span>Buyer {deal.buyer_confirmed_at ? "confirmed" : "pending"}</span><span>Seller {deal.seller_confirmed_at ? "confirmed" : "pending"}</span></div>
            {!buyer && deal.deal_status === "pending" && !deal.seller_confirmed_at && <button className="primary" disabled={busy === deal.id} onClick={() => void confirmSeller(deal)}>{busy === deal.id ? "Saving…" : "Confirm this deal"}</button>}
            {buyer && deal.deal_status === "confirmed" && <div className="review-forms">
              {(["seller","product"] as const).map(type => {
                const existing = type === "seller" ? existingSellerReview : existingProductReview;
                return <div className="review-form-card" key={type}>
                  <b>{type === "seller" ? "Review this seller" : "Review this product"}</b>
                  {existing ? <p className="muted">Your {type} review is {existing.review_status} (rating: {existing.rating}/5).</p> :
                    <form onSubmit={event => void submitReview(event, deal, type)}>
                      <label>Rating<select name="rating" defaultValue="5"><option value="5">5 — Excellent</option><option value="4">4 — Good</option><option value="3">3 — Average</option><option value="2">2 — Poor</option><option value="1">1 — Very poor</option></select></label>
                      <label>Comment (optional)<textarea name="review_text" rows={2} maxLength={1000} placeholder="Share a factual experience from this confirmed deal." /></label>
                      <button className="secondary-action" type="submit" disabled={busy === `${deal.id}-${type}`}>{busy === `${deal.id}-${type}` ? "Submitting…" : "Submit review"}</button>
                    </form>}
                </div>;
              })}
            </div>}
          </article>;
        })}</div>}
    </section>
    <section className="activity-panel">
      <h3>Suggest product compatibility</h3>
      <p className="muted">Help improve the catalogue by suggesting which parts fit, work with, replace or are not compatible with another product. Suggestions remain pending until reviewed.</p>
      {uniqueProducts.length < 2 ? <p className="empty">At least two active catalogue products are needed before a compatibility suggestion can be submitted.</p> :
        <form className="activity-form" onSubmit={submitCompatibility}>
          <label>Part or accessory<select required value={compatPart} onChange={e => setCompatPart(e.target.value)}><option value="">Choose a product</option>{uniqueProducts.map(p => <option key={p.productId} value={p.productId}>{p.name}{p.brand ? ` · ${p.brand}` : ""}{p.model ? ` ${p.model}` : ""}</option>)}</select></label>
          <label>Compatible product<select required value={compatTarget} onChange={e => setCompatTarget(e.target.value)}><option value="">Choose a product</option>{uniqueProducts.map(p => <option key={p.productId} value={p.productId} disabled={p.productId === compatPart}>{p.name}{p.brand ? ` · ${p.brand}` : ""}{p.model ? ` ${p.model}` : ""}</option>)}</select></label>
          <label>Relationship<select value={compatType} onChange={e => setCompatType(e.target.value)}><option value="fits">Fits</option><option value="works_with">Works with</option><option value="replacement_for">Replacement for</option><option value="not_compatible">Not compatible</option></select></label>
          <label>Evidence or notes (optional)<textarea rows={3} maxLength={1000} value={compatNotes} onChange={e => setCompatNotes(e.target.value)} placeholder="Add model numbers, version details or the basis for this suggestion." /></label>
          <button className="primary" type="submit" disabled={busy === "compatibility"}>{busy === "compatibility" ? "Submitting…" : "Submit suggestion"}</button>
        </form>}
    </section>
  </section>;
}
