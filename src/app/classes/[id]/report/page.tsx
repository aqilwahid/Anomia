import type { Metadata } from "next";
import { ReportStep } from "@/features/report/ReportStep";

export const metadata: Metadata = { title: "Laporan Instruktur" };

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReportStep classGroupId={id} />;
}
