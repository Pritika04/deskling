import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { siteUrl as origin } from "../lib/site-url";
export const metadata: Metadata = {
  metadataBase: new URL(origin), title: "Deskling — A little desktop pet for your everyday habits",
  description: "Meet Deskling, a free desktop pet and habit tracker for Windows. Build gentle habits with a little buddy, reminders, small celebrations and lovely collectible accessories. No account needed.",
  alternates: { canonical: "/" },
  openGraph: { title: "Good habits. Better company. Meet Deskling.", description: "A little desktop buddy for your everyday habits. Free for Windows. No account needed.", type: "website", siteName: "Deskling", url: origin, images: [{ url: "/social.png", width: 1200, height: 630, alt: "Deskling desktop buddies: a sprout, pineapple and star" }] },
  twitter: { card: "summary_large_image", title: "Good habits. Better company.", description: "Meet Deskling, a little desktop buddy for your everyday habits.", images: ["/social.png"] }, icons: { icon: "/favicon.svg" },
};
const software = { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Deskling", description: "A desktop pet and habit tracker with gentle reminders, progress tracking and collectible accessories.", operatingSystem: "Windows", applicationCategory: "LifestyleApplication", softwareVersion: "0.1.6", url: origin, downloadUrl: "https://github.com/Pritika04/deskling/releases/download/v0.1.6/Deskling-0.1.6-win-x64.exe", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, featureList: "Desktop pet, habit tracking, reminders, local data storage, streak grace, collectible accessories" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(software) }} />{children}<Analytics /></body></html>; }
