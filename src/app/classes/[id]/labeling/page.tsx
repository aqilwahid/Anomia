import { LabelingStep } from "@/features/classes/LabelingStep";

export default async function LabelingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LabelingStep classGroupId={id} />;
}
