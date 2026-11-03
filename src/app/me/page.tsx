import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, authEnabled } from "@/auth";
import { userReports } from "@/engine/kv";
import { loadReport } from "@/engine/store";
import { grade } from "@/engine/score";

export const dynamic = "force-dynamic";

export default async function Me() {
  if (!authEnabled) redirect("/");
  const session = await auth().catch(() => null);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) redirect("/api/auth/signin?callbackUrl=/me");
  const ids = await userReports(uid);
  const reports = (await Promise.all(ids.slice(0, 50).map((id) => loadReport(id)))).filter((r): r is NonNullable<typeof r> => !!r);
  return (
    <main className="hist">
      <h1>Your reports</h1>
      <p className="sub">{session?.user?.email} · {reports.length} report{reports.length === 1 ? "" : "s"}. Scans you run while signed in land here.</p>
      <div className="list recent">
        {reports.length === 0 && <p className="empty">Nothing yet. <Link href="/">Run a scan</Link> and it will show up here.</p>}
        {reports.map((r) => (
          <Link key={r.id} href={`/r/${r.id}`}>
            <span className="n">{r.score}</span>
            <span>
              {r.page.title || r.input.url || "Pasted HTML"}
              <span className="t"> · {grade(r.score).word} · {r.input.pageType}</span>
            </span>
            <span className="t">{new Date(r.createdAt).toLocaleDateString()}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
