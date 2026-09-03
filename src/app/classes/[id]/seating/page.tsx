import { SeatingStep } from "@/features/classes/SeatingStep";

export default async function SeatingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SeatingStep classGroupId={id} />;
}
