import { notFound } from "next/navigation";
import { loadReport } from "@/engine/store";
import { ReportView } from "@/components/ReportView";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let report = null;
  try {
    report = await loadReport(id);
  } catch {
    report = null;
  }
  if (!report) notFound();
  return <ReportView report={report} />;
}
