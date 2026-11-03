import { readFile } from "node:fs/promises";
import path from "node:path";

export const metadata = { title: "Notices — Squint" };

/** Third-party attributions, served from NOTICES.md so the licenses that require it are honoured. */
export default async function Notices() {
  const md = await readFile(path.join(process.cwd(), "NOTICES.md"), "utf8").catch(() => "Notices unavailable.");
  const rows = [...md.matchAll(/^\| \[?([^\]|]+)\]?(?:\(([^)]*)\))?[^|]*\| ([^|]+) \| ([^|]+) \|$/gm)].filter((m) => !/^-+$/.test(m[1].trim()) && m[1].trim() !== "Project");
  const tail = md.split("\n").filter((l) => l.trim() && !l.startsWith("|") && !l.startsWith("#")).slice(-2);
  return (
    <main className="hist">
      <h1>Notices</h1>
      <p className="sub">Squint builds on open-source work and published research. Code was re-implemented where the license permits; thresholds, phrase lists and the critique format are credited here.</p>
      <div className="catalogue" style={{ maxWidth: "none" }}>
        {rows.map((m) => (
          <div key={m[1]} style={{ display: "contents" }}>
            <div className="fam">{m[2] ? <a href={m[2]} target="_blank" rel="noreferrer">{m[1].trim()}</a> : m[1].trim()}<small>{m[3].trim()}</small></div>
            <div className="rules" style={{ maxWidth: "none" }}>{m[4].trim()}</div>
          </div>
        ))}
      </div>
      {tail.map((t, i) => <p key={i} className="sub" style={{ marginTop: 18, fontSize: 15 }}>{t}</p>)}
    </main>
  );
}
