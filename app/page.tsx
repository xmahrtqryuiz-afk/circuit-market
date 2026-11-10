"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { brand } from "../config/brand";
import { supabase } from "../lib/supabase";
import AccountAccess from "../components/AccountAccess";
import SellerWorkspace from "../components/SellerWorkspace";
import PriceContribution from "../components/PriceContribution";
import AdminDashboard from "../components/AdminDashboard";
import MarketplaceActivity from "../components/MarketplaceActivity";
import type { User } from "@supabase/supabase-js";

type Category = { id: string; name: string; slug: string };
type Product = {
  id: string; productId: string; name: string; brand: string | null; model: string | null; category: string; variant: string; condition: string;
  price: number; seller: string; storeId: string; area: string; city: string; description: string; imageUrl: string | null; imageAlt: string;
};
type CompatibilityLink = { id: string; compatibility_type: string; notes: string | null; otherProductName: string; direction: "outgoing" | "incoming" };
type PriceRange = {
  id: string; product_id: string; variant_label: string | null; item_condition: string;
  currency_code: string; geographic_level: string; sample_count: number;
  min_price: number | null; median_price: number | null; max_price: number | null;
};
const money = (n: number, currency = "NGN") => new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

export default function Home() {
  const [tab, setTab] = useState("Home");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ranges, setRanges] = useState<PriceRange[]>([]);
  const [catalogueProductNames, setCatalogueProductNames] = useState<Record<string, string>>({});
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [adminAccess, setAdminAccess] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState("");
  const [unlockedContact, setUnlockedContact] = useState<{ channel: string; contact: string } | null>(null);
  const [dealBusy, setDealBusy] = useState(false);
  const [dealMessage, setDealMessage] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("misleading_listing");
  const [reportDetails, setReportDetails] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [reportError, setReportError] = useState("");
  const [compatibilityLinks, setCompatibilityLinks] = useState<CompatibilityLink[]>([]);
  const [compatibilityLoading, setCompatibilityLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    async function loadPublicCatalogue() {
      if (!supabase) { setError("The catalogue connection is not configured yet."); setLoading(false); return; }
      setLoading(true); setError("");
      try {
        const [catRes, listingRes, rangeRes] = await Promise.all([
          supabase.from("categories").select("id,name,slug").eq("is_active", true).order("sort_order"),
          supabase.from("listings").select("id,product_id,seller_store_id,variant_label,item_condition,asking_price,city,area,notes,currency_code").eq("is_active", true).eq("moderation_status", "approved").order("created_at", { ascending: false }).limit(60),
          supabase.from("price_range_snapshots").select("id,product_id,variant_label,item_condition,currency_code,geographic_level,sample_count,min_price,median_price,max_price").eq("snapshot_status", "published").order("calculated_at", { ascending: false }).limit(60)
        ]);
        if (catRes.error) throw catRes.error;
        if (listingRes.error) throw listingRes.error;
        if (rangeRes.error) throw rangeRes.error;
        const listings = listingRes.data ?? [];
        const publishedRanges = (rangeRes.data ?? []) as PriceRange[];
        const productIds = [...new Set([...listings.map(x => x.product_id), ...publishedRanges.map(x => x.product_id)])];
        const storeIds = [...new Set(listings.map(x => x.seller_store_id))];
        const [prodRes, storeRes, imageRes] = await Promise.all([
          productIds.length ? supabase.from("products").select("id,name,category_id,brand,model,description").in("id", productIds).eq("is_active", true) : Promise.resolve({ data: [], error: null }),
          storeIds.length ? supabase.from("seller_stores").select("id,store_name,city,area").in("id", storeIds) : Promise.resolve({ data: [], error: null }),
          listings.length ? supabase.from("listing_images").select("listing_id,storage_path,alt_text,sort_order").in("listing_id", listings.map(x => x.id)).eq("image_review_status", "approved").order("sort_order") : Promise.resolve({ data: [], error: null })
        ]);
        if (prodRes.error) throw prodRes.error;
        if (storeRes.error) throw storeRes.error;
        if (imageRes.error) throw imageRes.error;
        const productMap = new Map((prodRes.data ?? []).map(x => [x.id, x]));
        const storeMap = new Map((storeRes.data ?? []).map(x => [x.id, x]));
        const catMap = new Map((catRes.data ?? []).map(x => [x.id, x.name]));
        const imageMap = new Map<string, { url: string; alt: string }>();
        for (const image of imageRes.data ?? []) {
          if (!imageMap.has(image.listing_id)) {
            const publicUrl = supabase.storage.from("listing-images").getPublicUrl(image.storage_path).data.publicUrl;
            imageMap.set(image.listing_id, { url: publicUrl, alt: image.alt_text || "Product photo" });
          }
        }
        const mapped: Product[] = listings.flatMap(row => {
          const p = productMap.get(row.product_id); const s = storeMap.get(row.seller_store_id);
          if (!p || !s) return [];
          return [{ id: row.id, productId: row.product_id, name: p.name, brand: p.brand ?? null, model: p.model ?? null, category: catMap.get(p.category_id) ?? "Electronics", variant: row.variant_label || "", condition: row.item_condition, price: Number(row.asking_price), seller: s.store_name, storeId: row.seller_store_id, area: row.area || s.area || "", city: row.city || s.city, description: row.notes || p.description || "Seller listing. Confirm availability and specifications with the seller.", imageUrl: imageMap.get(row.id)?.url ?? null, imageAlt: imageMap.get(row.id)?.alt ?? p.name }];
        });
        if (!alive) return;
        setCategories(catRes.data ?? []); setProducts(mapped); setRanges(publishedRanges); setCatalogueProductNames(Object.fromEntries((prodRes.data ?? []).map(x => [x.id, x.name])));
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Could not load the public catalogue.");
      } finally { if (alive) setLoading(false); }
    }
    loadPublicCatalogue();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelected(null);
        setContactError("");
        setUnlockedContact(null);
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(element => element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      window.removeEventListener("keydown", handleDialogKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [selected]);

  const categoryNames = ["All", ...categories.map(c => c.name)];

  async function unlockSellerContact(channel: "phone" | "whatsapp") {
    if (!selected) return;
    setContactError("");
    setUnlockedContact(null);
    if (!user) { setContactError("Please sign in using the account button above before contacting a seller."); return; }
    if (!supabase) { setContactError("The secure contact service is unavailable. Please try again later."); return; }
    setContactBusy(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("unlock-seller-contact", {
        body: { store_id: selected.storeId, listing_id: selected.id, channel },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      if (typeof data?.contact !== "string" || !data.contact) throw new Error("Seller contact details were not returned.");
      setUnlockedContact({ channel, contact: data.contact });
    } catch (err) {
      setContactError(err instanceof Error ? err.message : "Could not unlock seller contact. Please try again.");
    } finally { setContactBusy(false); }
  }
  async function startDealConfirmation() {
    if (!selected) return;
    setDealMessage("");
    if (!user) { setDealMessage("Please sign in before confirming purchase interest."); return; }
    if (!supabase) { setDealMessage("Marketplace actions are temporarily unavailable."); return; }
    setDealBusy(true);
    try {
      const existing = await supabase.from("deal_confirmations").select("id,deal_status").eq("buyer_id", user.id).eq("listing_id", selected.id).in("deal_status", ["pending", "confirmed"]).limit(1);
      if (existing.error) throw existing.error;
      if (existing.data?.length) { setDealMessage(existing.data[0].deal_status === "confirmed" ? "You already have a confirmed deal for this listing. See My Activity." : "You already have a pending confirmation for this listing. See My Activity."); return; }
      const { error: insertError } = await supabase.from("deal_confirmations").insert({ buyer_id: user.id, listing_id: selected.id, store_id: selected.storeId, buyer_confirmed_at: new Date().toISOString() });
      if (insertError) throw insertError;
      setDealMessage("Your purchase interest is confirmed. The seller must also confirm before this becomes a confirmed deal. No payment has been taken.");
    } catch (err) { setDealMessage(err instanceof Error ? err.message : "Could not start the deal confirmation."); }
    finally { setDealBusy(false); }
  }

  async function submitListingReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    if (!user) { setReportError("Please sign in before submitting a report."); return; }
    if (!supabase) { setReportError("Reporting is temporarily unavailable."); return; }
    setReportBusy(true); setReportError(""); setReportMessage("");
    const { error: insertError } = await supabase.from("user_reports").insert({ reporter_id: user.id, target_type: "listing", target_id: selected.id, reason: reportReason, details: reportDetails.trim() || null });
    if (insertError) setReportError(insertError.message);
    else { setReportMessage("Thank you. Your report has been sent to the moderation team."); setReportDetails(""); setReportOpen(false); }
    setReportBusy(false);
  }

  const activityProducts = useMemo(() => Array.from(new Map(products.map(p => [p.productId, { productId: p.productId, name: p.name, brand: p.brand, model: p.model }])).values()), [products]);
  const filtered = useMemo(() => products.filter(p => (category === "All" || p.category === category) && ([p.name, p.brand, p.model, p.variant, p.seller, p.category].filter(Boolean).join(" ")).toLowerCase().includes(query.trim().toLowerCase())), [products, category, query]);

  return <main className="shell">
    <header className="topbar"><a className="brand" href="#" aria-label={`${brand.name} home`} onClick={() => setTab("Home")}><span className="brandmark">{brand.name}<span className="brandmark-symbol">»</span></span></a><span className="location">⌖ {brand.defaultLocationLabel}</span><AccountAccess onAuthChange={setUser}/></header>
    <section className="hero"><div className="eyebrow">{brand.name} · ELECTRONICS MARKETPLACE</div><h1>Find it. Compare it.<br/><em>Buy with confidence.</em></h1><p>Explore electronics, compare seller prices and connect with shops around Port Harcourt.</p><div className="searchbar"><span>⌕</span><input aria-label="Search electronics listings" value={query} onChange={e => {setQuery(e.target.value); setTab("Explore");}} placeholder="Search phones, parts, laptops, tools..."/><button onClick={() => setTab("Explore")}>Search</button></div><div className="hero-note"><span className="dot"/> Live catalogue · Published price evidence only</div></section>
    <nav className="tabs">{["Home", "Explore", "PriceCheck", "Sell", ...(user ? ["My Activity"] : []), ...(adminAccess ? ["Admin"] : [])].map(t => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t === "PriceCheck" ? "₦ PriceCheck" : t === "My Activity" ? "Activity" : t}</button>)}</nav>
    {error && <div className="notice" role="alert">The catalogue could not be loaded: {error}</div>}
    {loading && <div className="empty">Connecting to the EZPREZZ catalogue…</div>}
    {!loading && tab === "Home" && <>
      <section className="sectionhead"><div><div className="eyebrow">START EXPLORING</div><h2>Shop electronics</h2></div><button className="textbutton" onClick={() => setTab("Explore")}>View all →</button></section>
      <div className="categorygrid">{categories.slice(0, 6).map((c, i) => <button className="categorytile" key={c.id} onClick={() => {setCategory(c.name); setTab("Explore");}}><span className="caticon">{["▣","⌁","▤","⚒","♫","▦"][i % 6]}</span><b>{c.name}</b><small>Explore listings</small></button>)}</div>
      <section className="sectionhead"><div><div className="eyebrow">RECENT LISTINGS</div><h2>Products to explore</h2><p className="muted">{products.length} approved public listings</p></div><button className="textbutton" onClick={() => setTab("Explore")}>See all →</button></section>
      <ProductGrid products={products.slice(0, 4)} onSelect={setSelected}/>
      <div className="callout"><div><div className="eyebrow">KNOW THE MARKET</div><h2>Check prices before you buy.</h2><p>Published PriceCheck ranges use reviewed evidence. Seller asking prices remain separate.</p></div><button onClick={() => setTab("PriceCheck")}>Open PriceCheck →</button></div>
    </>}
    {!loading && tab === "Explore" && <><section className="sectionhead"><div><div className="eyebrow">THE MARKETPLACE</div><h2>Explore products</h2><p className="muted">{filtered.length === products.length ? `${filtered.length} approved public listings` : `Showing ${filtered.length} of ${products.length} approved public listings`}</p></div>{(category !== "All" || query.trim()) && <button className="filter-reset" onClick={() => {setCategory("All"); setQuery("");}}>Clear filters</button>}</section><div className="filters" aria-label="Filter listings by category">{categoryNames.map(c => <button key={c} type="button" aria-pressed={category === c} className={category === c ? "chosen" : ""} onClick={() => setCategory(c)}>{c}</button>)}</div>{filtered.length ? <ProductGrid products={filtered} onSelect={setSelected}/> : <div className="empty search-empty"><b>No matching listings</b><p>Try another search or category. Only approved live listings appear here.</p><button className="textbutton" onClick={() => {setCategory("All"); setQuery("");}}>Clear search and filters →</button></div>}<p className="disclaimer">Only active listings approved by moderation and belonging to verified stores are shown.</p></>}
    {!loading && tab === "PriceCheck" && <><section className="sectionhead"><div><div className="eyebrow">PRICE INTELLIGENCE</div><h2>PriceCheck</h2><p className="muted">Published ranges from reviewed price evidence.</p></div></section><div className="pricebanner"><span>₦</span><div><b>Evidence before estimates</b><small>Seller asking prices are not treated as verified market prices.</small></div></div>{ranges.length ? <div className="pricegroups">{ranges.map(r => <article className="pricegroup" key={r.id}><div className="pricegrouphead"><b>{catalogueProductNames[r.product_id] || "Product price range"}{r.variant_label ? ` · ${r.variant_label}` : ""}</b><div className="pricecontext"><span>{r.item_condition.replaceAll("_", " ")}</span><span>{r.geographic_level.replaceAll("_", " ")}</span><span>{r.sample_count} reviewed {r.sample_count === 1 ? "observation" : "observations"}</span></div></div><div className="priceitems" aria-label="Published price summary"><div className="pricemetric"><span>Minimum</span><b>{r.min_price == null ? "—" : money(Number(r.min_price), r.currency_code)}</b></div><div className="pricemetric median"><span>Median</span><b>{r.median_price == null ? "—" : money(Number(r.median_price), r.currency_code)}</b></div><div className="pricemetric"><span>Maximum</span><b>{r.max_price == null ? "—" : money(Number(r.max_price), r.currency_code)}</b></div></div><p className="pricefootnote">Published evidence snapshot · Seller asking prices are separate</p></article>)}</div> : <div className="empty">No published price ranges yet. Price reports will appear here only after review and when evidence thresholds are met.</div>}<PriceContribution user={user} onRequestProduct={() => setTab("Sell")}/></>}
    {!loading && tab === "Sell" && <><section className="sectionhead"><div><div className="eyebrow">FOR SELLERS</div><h2>Seller workspace</h2><p className="muted">Register your store, manage inventory and request missing catalogue products.</p></div></section><SellerWorkspace user={user} categories={categories}/></>}
    {!loading && tab === "My Activity" && <MarketplaceActivity user={user} products={activityProducts}/>}
    <AdminDashboard user={user} active={tab === "Admin"} onAccessChange={setAdminAccess} categories={categories}/>
    <footer><a className="brand" href="#" aria-label={`${brand.name} home`}><span className="brandmark">{brand.name}<span className="brandmark-symbol">»</span></span></a><p>Built for electronics buyers and sellers in Nigeria.</p><small>EZPREZZ · Live catalogue connection</small></footer>
    {selected && <div className="modalback" onClick={() => {setSelected(null); setContactError(""); setUnlockedContact(null);}}><div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="product-detail-title" tabIndex={-1} onClick={e=>e.stopPropagation()}><button ref={closeButtonRef} className="close" type="button" aria-label="Close product details" onClick={()=>{setSelected(null); setContactError(""); setUnlockedContact(null);}}>×</button><div className="productvisual large">{selected.imageUrl ? <img src={selected.imageUrl} alt={selected.imageAlt} /> : "▣"}</div><div className="eyebrow">{selected.category}</div><h2 id="product-detail-title">{selected.name}</h2>{(selected.brand || selected.model) && <p className="productidentity detailidentity">{[selected.brand, selected.model].filter(Boolean).join(" · ")}</p>}<p className="muted">{[selected.variant, selected.condition.replaceAll("_", " ")].filter(Boolean).join(" · ")}</p><div className="detailprice">{money(selected.price)}</div><span className="tag asking">Seller asking price · Not independently verified</span><p>{selected.description}</p>{(compatibilityLoading || compatibilityLinks.length > 0) && <div className="compatibility-summary"><h3>Verified compatibility</h3>{compatibilityLoading ? <p className="muted">Checking approved compatibility information…</p> : compatibilityLinks.map(link => <div className="compatibility-row" key={link.id}><b>{link.direction === "outgoing" ? "Related product" : "Fits this product"}: {link.otherProductName}</b><span>{link.compatibility_type.replaceAll("_", " ")}</span>{link.notes && <small>{link.notes}</small>}</div>)}</div>}<div className="sellerbox"><b>{selected.seller}</b><span>{selected.area ? `${selected.area}, ` : ""}{selected.city}</span></div><div className="contact-actions"><button className="primary" disabled={contactBusy} onClick={()=>unlockSellerContact("phone")}>{contactBusy ? "Please wait…" : "Unlock phone"}</button><button className="secondary-action" disabled={contactBusy} onClick={()=>unlockSellerContact("whatsapp")}>Unlock WhatsApp</button></div>{contactError && <p className="account-error" role="alert">{contactError}</p>}{unlockedContact && <div className="unlocked-contact"><b>{unlockedContact.channel === "phone" ? "Seller phone" : "Seller WhatsApp"}</b><a href={unlockedContact.channel === "phone" ? `tel:${unlockedContact.contact}` : `https://wa.me/${unlockedContact.contact.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">{unlockedContact.contact}</a></div>}<div className="listing-engagement"><h3>Purchase confirmation</h3><p className="muted">Confirm your purchase interest. This is not a payment or delivery booking; the seller must also confirm the deal.</p><button className="primary full" onClick={startDealConfirmation} disabled={dealBusy}>{dealBusy ? "Please wait…" : "Confirm purchase interest"}</button>{dealMessage && <p className="account-status" role="status">{dealMessage}</p>}</div><div className="listing-engagement"><button className="textbutton" type="button" onClick={()=>{setReportOpen(!reportOpen);setReportError("");setReportMessage("");}}> {reportOpen ? "Cancel report" : "Report this listing"} </button>{reportOpen && <form className="activity-form" onSubmit={submitListingReport}><label>Reason<select value={reportReason} onChange={e=>setReportReason(e.target.value)}><option value="misleading_listing">Misleading listing</option><option value="suspected_scam">Suspected scam</option><option value="incorrect_information">Incorrect information</option><option value="prohibited_item">Prohibited or unsafe item</option><option value="other">Other</option></select></label><label>Details (optional)<textarea rows={3} maxLength={1000} value={reportDetails} onChange={e=>setReportDetails(e.target.value)} placeholder="Describe the concern clearly." /></label><button className="secondary-action" type="submit" disabled={reportBusy}>{reportBusy ? "Sending…" : "Submit report"}</button>{reportError && <p className="account-error" role="alert">{reportError}</p>}</form>}{reportMessage && <p className="account-status" role="status">{reportMessage}</p>}</div><button className="secondary-action full" onClick={()=>setSelected(null)}>Close details</button></div></div>}
  </main>;
}

function ProductGrid({ products, onSelect }: { products: Product[]; onSelect: (p: Product) => void }) {
  if (!products.length) return <div className="empty">No approved listings are available yet. Try another category later.</div>;
  return <div className="productgrid">{products.map(p=><button className="productcard" key={p.id} onClick={()=>onSelect(p)} aria-label={`View ${[p.brand, p.name, p.model, p.variant].filter(Boolean).join(" ")} from ${p.seller}`}><div className="productvisual">{p.imageUrl ? <img src={p.imageUrl} alt={p.imageAlt} loading="lazy" /> : "▣"}</div><div className="productmeta"><span>{p.category}</span><span aria-hidden="true">·</span><span>{p.area || p.city}</span></div>{(p.brand || p.model) && <span className="productidentity">{[p.brand, p.model].filter(Boolean).join(" · ")}</span>}<b className="productname">{p.name}</b>{p.variant && <small className="productvariant">{p.variant}</small>}<div className="productcardfooter"><strong>{money(p.price)}</strong><span className="tag condition">{p.condition.replaceAll("_", " ")}</span></div><div className="productcardtrust"><span className="productseller">{p.seller}</span><span className="tag asking">Asking price</span></div></button>)}</div>;
}
