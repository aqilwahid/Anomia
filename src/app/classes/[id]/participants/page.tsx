import type { Metadata } from "next";
import { ParticipantsPhotosStepLoader } from "@/features/participants/ParticipantsPhotosStepLoader";

export const metadata: Metadata = { title: "Peserta & Foto" };

export default async function ParticipantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ParticipantsPhotosStepLoader classGroupId={id} />;
}
