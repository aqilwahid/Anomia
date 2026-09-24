import type { Metadata } from "next";
import { SeatingStep } from "@/features/seating/SeatingStep";

export const metadata: Metadata = { title: "Denah Ruangan" };

export default async function SeatingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SeatingStep classGroupId={id} />;
}
