import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Squint",
  description: "Lighthouse for taste: measures what a front-end engineer would notice and what makes a page look generated.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">
          <header className="top">
            <Link href="/" className="brand">
              Squint<small>the squint test, automated</small>
            </Link>
            <nav>
              <Link href="/">New report</Link>
              <a href="https://github.com/pbakaus/impeccable" target="_blank" rel="noreferrer">Impeccable</a>
            </nav>
          </header>
          {children}
          <footer className="foot">
            Engines: Squint rules (DOM geometry + computed styles), Impeccable (Apache-2.0), first-impression metrics after Reinecke et al. 2013, critique format from UICrit (CC-BY-4.0).
            Measured findings are facts; heuristic findings are rules that can misfire; judgment findings are a reviewer&apos;s opinion.
          </footer>
        </div>
      </body>
    </html>
  );
}
