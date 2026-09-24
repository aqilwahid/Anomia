import type { Metadata } from "next";
import { LabelingStepLoader } from "@/features/labeling/LabelingStepLoader";

export const metadata: Metadata = { title: "Labeling Wajah" };

export default async function LabelingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LabelingStepLoader classGroupId={id} />;
}
