import { ClassInfoStep } from "@/features/classes/ClassInfoStep";

export default async function ClassInfoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClassInfoStep classGroupId={id} />;
}
