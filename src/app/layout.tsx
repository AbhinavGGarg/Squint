import type { Metadata } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { HeaderAuth } from "@/components/HeaderAuth";
import "./globals.css";

const site = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "Squint",
  description: "The squint test, automated. Measures what a front-end engineer notices in ten seconds and what makes a page look generated.",
  alternates: { canonical: "/" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- root layout, applies to every page */}
        <link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className="wrap">
          <header className="top">
            <Link href="/" className="brand">
              Squint<small>the squint test, automated</small>
            </Link>
            <nav>
              <Link href="/">New report</Link>
              <Link href="/#cli">CLI</Link>
              <a href="https://github.com/AbhinavGGarg/Squint" target="_blank" rel="noreferrer">GitHub</a>
              <HeaderAuth />
            </nav>
          </header>
          {children}
          <footer className="foot">
            <span>
              Engines: Squint rules (DOM geometry and computed styles), Impeccable (Apache-2.0), first-impression metrics after Reinecke et al. 2013, critique format from UICrit (CC-BY-4.0).
              Measured findings are facts; heuristic findings are rules that can misfire; judgment findings are a reviewer&apos;s opinion.
            </span>
            <span><Link href="/notices">Notices</Link></span>
          </footer>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
