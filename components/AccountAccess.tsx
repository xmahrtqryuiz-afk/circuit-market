"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type Props = { onAuthChange?: (user: User | null) => void };

export default function AccountAccess({ onAuthChange }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
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
  }, [open]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      onAuthChange?.(data.session?.user ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      onAuthChange?.(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, [onAuthChange]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) { setError("Account access is not configured. Please try again later."); return; }
    if (mode === "signup" && (!name.trim() || !city.trim())) {
      setError("Enter your name and city to create your account.");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim(), city: city.trim() } },
        });
        if (authError) throw authError;
        if (data.session) {
          setMessage("Your EZPREZZ account is ready.");
          setOpen(false);
        } else {
          setMessage("Check your email for the confirmation link, then sign in here.");
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        setMessage("You are signed in.");
        setOpen(false);
      }
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account access failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
    else { setMessage("You have signed out."); setOpen(false); }
  }

  return <>
    <div className="account-actions">
      {user ? <button className="account-trigger" onClick={() => setOpen(true)}>{user.email?.split("@")[0] || "Account"}</button>
        : <button className="account-trigger" onClick={() => { setMode("signin"); setOpen(true); }}>Sign in</button>}
    </div>
    {message && !open && <span className="account-status" role="status">{message}</span>}
    {open && <div className="modalback" onClick={() => setOpen(false)}>
      <section ref={dialogRef} className="modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title" tabIndex={-1} onClick={event => event.stopPropagation()}>
        <button ref={closeButtonRef} className="close" type="button" aria-label="Close account dialog" onClick={() => setOpen(false)}>×</button>
        {user ? <>
          <div className="eyebrow">YOUR EZPREZZ ACCOUNT</div>
          <h2 id="account-title">Welcome back</h2>
          <p>{user.email}</p>
          <button className="primary full" onClick={signOut}>Sign out</button>
        </> : <>
          <div className="eyebrow">EZPREZZ ACCOUNT</div>
          <h2 id="account-title">{mode === "signin" ? "Sign in" : "Create your account"}</h2>
          <p>Use one account to buy, sell and contribute price observations on EZPREZZ.</p>
          <form onSubmit={submit}>
            <div className="formgrid account-form">
              {mode === "signup" && <>
                <label>Your name<input autoComplete="name" required value={name} onChange={e => setName(e.target.value)} placeholder="Full name" /></label>
                <label>City<input autoComplete="address-level2" required value={city} onChange={e => setCity(e.target.value)} placeholder="Your city" /></label>
              </>}
              <label>Email address<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
              <label>Password<input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>
            </div>
            {error && <p className="account-error" role="alert">{error}</p>}
            {message && <p className="account-status" role="status">{message}</p>}
            <button className="primary full" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button>
          </form>
          <button className="textbutton account-switch" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setMessage(""); }}>
            {mode === "signin" ? "New to EZPREZZ? Create an account" : "Already have an account? Sign in"}
          </button>
        </>}
      </section>
    </div>}
  </>;
}
