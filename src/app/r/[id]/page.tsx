import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadReport } from "@/engine/store";
import { grade } from "@/engine/score";
import { ReportView } from "@/components/ReportView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const r = await loadReport(id).catch(() => null);
  if (!r) return { title: "Report not found — Squint" };
  const g = grade(r.score);
  const name = r.page.title || r.input.url || "Pasted HTML";
  const title = `${r.score}/100 · ${g.word} — ${name}`;
  const description = `Squint report: ${r.findings.filter((f) => f.severity === "error").length} errors, ${r.findings.filter((f) => f.severity === "warn").length} warnings. Measured from the DOM, not guessed.`;
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: `/api/report/${id}/og`, width: 1200, height: 630 }], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [`/api/report/${id}/og`] },
  };
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await loadReport(id).catch(() => null);
  if (!report) notFound();
  return <ReportView report={report} />;
}
