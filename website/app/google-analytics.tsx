"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { applyConsent, measurementId, readConsent, trackDownload } from "../lib/google-analytics";

const preferenceEvent = "deskling:analytics-preferences";

export function AnalyticsPreferences() {
  return <button type="button" className="footer-analytics" onClick={() => window.dispatchEvent(new Event(preferenceEvent))}>Analytics preferences</button>;
}

export default function GoogleAnalytics() {
  const [choice, setChoice] = useState<"allow" | "deny" | null>(null);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const stored = readConsent();
    setChoice(stored); setOpen(stored === null); setReady(true);
    const show = () => setOpen(true);
    window.addEventListener(preferenceEvent, show);
    return () => window.removeEventListener(preferenceEvent, show);
  }, []);
  useEffect(() => { if (ready) applyConsent(choice); }, [choice, ready]);
  useEffect(() => {
    let navigating = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || !(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a.platform-download");
      if (!link) return;
      const externalTab = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === "_blank";
      if (externalTab) { trackDownload(link.href); return; }
      if (navigating) { event.preventDefault(); return; }
      let finished = false;
      let timer: ReturnType<typeof setTimeout>;
      const go = () => {
        if (finished) return;
        finished = true; navigating = false; clearTimeout(timer); timers.delete(timer);
        window.location.assign(link.href);
      };
      if (!trackDownload(link.href, () => queueMicrotask(go))) return;
      event.preventDefault(); navigating = true;
      timer = setTimeout(go, 800); timers.add(timer);
    };
    document.addEventListener("click", click);
    return () => { document.removeEventListener("click", click); timers.forEach(clearTimeout); };
  }, []);

  const choose = (value: "allow" | "deny") => {
    setChoice(value); setOpen(false);
  };
  return <>
    {ready && choice === "allow" && <Script id="deskling-google-analytics" src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />}
    {ready && open && <aside className="analytics-choice" aria-label="Optional analytics preferences"><div><span className="analytics-label">OPTIONAL ANALYTICS</span><p>May we use Google Analytics to understand visits and download clicks? Your habit data stays on your device.</p><a href="/#privacy" onClick={() => { const privacy = document.querySelector<HTMLDetailsElement>("#privacy"); if (privacy) privacy.open = true; }}>Privacy details</a></div><div className="analytics-choice-actions"><button type="button" onClick={() => choose("allow")}>Allow</button><button type="button" onClick={() => choose("deny")}>No thanks</button></div></aside>}
  </>;
}
