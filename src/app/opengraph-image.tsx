import { ImageResponse } from "next/og";

export const alt = "Squint — the squint test, automated";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#ffffff", color: "#141414", padding: "64px 72px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "baseline", fontSize: 28, fontWeight: 700 }}><span>Squint</span><span style={{ color: "#6a6a6a", fontWeight: 400, marginLeft: 14 }}>the squint test, automated</span></div>
        <div style={{ display: "flex", fontSize: 72, fontWeight: 600, lineHeight: 1.1, letterSpacing: -2, maxWidth: 1000 }}>Find out why your site looks generated, with numbers.</div>
        <div style={{ display: "flex", fontSize: 26, color: "#4a4a4a" }}>Measured from the DOM · AI-default fingerprints · mobile pass · first impression, after Reinecke 2013</div>
      </div>
    ),
    size,
  );
}
