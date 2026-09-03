import { ClassWorkspaceLoader } from "@/features/classes/ClassWorkspaceLoader";

export default async function ClassPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClassWorkspaceLoader classGroupId={id} />;
}
