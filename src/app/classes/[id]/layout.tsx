import { ClassWizardShell } from "@/features/classes/ClassWizardShell";

export default async function ClassLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClassWizardShell classGroupId={id}>{children}</ClassWizardShell>;
}
