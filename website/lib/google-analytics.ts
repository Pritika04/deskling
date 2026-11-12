import { downloads, releaseVersion } from "./downloads";

export const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || "G-C89ZESKC7R";
export const consentKey = "deskling.analytics-choice.v1";
const firstDownloadKey = "deskling.first-download-click.v1";
const denied = { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
type Consent = "allow" | "deny";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    desklingGoogleConfigured?: boolean;
    desklingGoogleBooted?: boolean;
  }
}

let consent: Consent | null = null;
let observedDownload = false;
const files = new Map(Object.entries(downloads).map(([key, url]) => [url, {
  download_platform: key === "windows" ? "windows" : key.startsWith("mac") ? "macos" : "linux",
  download_architecture: key === "macArm" ? "arm64" : "x64",
  release_version: releaseVersion,
  file_name: url.split("/").at(-1)!,
  link_url: url,
}]));

export function readConsent(): Consent | null {
  try { const value = localStorage.getItem(consentKey); return value === "allow" || value === "deny" ? value : null; }
  catch { return null; }
}

function disableFlag(value: boolean) {
  (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = value;
}

export function applyConsent(choice: Consent | null) {
  consent = choice;
  if (choice) { try { localStorage.setItem(consentKey, choice); } catch { /* Choice still applies to this page. */ } }
  if (choice !== "allow") {
    disableFlag(true);
    window.gtag?.("consent", "update", denied);
    window.desklingGoogleConfigured = false;
    if (choice === "deny") {
      observedDownload = false;
      try { localStorage.removeItem(firstDownloadKey); } catch { /* Storage can be unavailable. */ }
      const domains = location.hostname.split(".");
      for (const cookie of document.cookie.split(";")) {
        const name = cookie.trim().split("=")[0];
        if (!/^_ga(?:_|$)/.test(name)) continue;
        const expired = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
        document.cookie = expired;
        for (let i = 0; i < domains.length - 1; i++) document.cookie = `${expired}; Domain=.${domains.slice(i).join(".")}`;
      }
    }
    return;
  }
  disableFlag(false);
  window.dataLayer ||= [];
  window.gtag ||= function () { window.dataLayer!.push(arguments); };
  if (!window.desklingGoogleBooted) {
    window.gtag("consent", "default", denied);
    window.gtag("js", new Date());
    window.desklingGoogleBooted = true;
  }
  window.gtag("consent", "update", { ...denied, analytics_storage: "granted" });
  if (!window.desklingGoogleConfigured) {
    window.gtag("config", measurementId, { allow_google_signals: false, allow_ad_personalization_signals: false });
    window.desklingGoogleConfigured = true;
  }
}

export function trackDownload(url: string, done?: () => void): boolean {
  const properties = files.get(url);
  if (consent !== "allow" || !properties || !window.gtag) return false;
  let first = false;
  // Without persistent storage, do not pretend we can identify a first-ever click.
  try {
    if (!observedDownload && !localStorage.getItem(firstDownloadKey)) {
      localStorage.setItem(firstDownloadKey, "observed");
      first = true;
    }
  } catch { /* Ordinary download clicks can still be measured after consent. */ }
  observedDownload = true;
  const payload = { ...properties, send_to: measurementId };
  if (first) window.gtag("event", "first_download_click", payload);
  window.gtag("event", "download_click", { ...payload, ...(done ? { event_callback: done, event_timeout: 800 } : {}) });
  return true;
}
