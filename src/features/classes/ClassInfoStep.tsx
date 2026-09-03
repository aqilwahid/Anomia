"use client";

import { useEffect, useState } from "react";
import { localStore } from "@/store/localStore";
import type { ClassGroup } from "@/domain/participant";
import { ClassInfoForm } from "./ClassInfoForm";

export function ClassInfoStep({ classGroupId }: { classGroupId: string }) {
  const [classGroup, setClassGroup] = useState<ClassGroup | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    localStore.getClassGroup(classGroupId).then((cg) => {
      if (!cancelled) setClassGroup(cg ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [classGroupId]);

  if (classGroup === undefined) {
    return <div className="mx-auto max-w-4xl px-layout-gutter-desktop py-space-2xl text-body-sm text-on-surface-variant">Memuat…</div>;
  }
  if (classGroup === null) return null;

  return (
    <div className="w-full max-w-3xl mx-auto px-layout-gutter-mobile md:px-layout-gutter-desktop py-space-lg md:py-space-xl">
      <ClassInfoForm classGroup={classGroup} />
    </div>
  );
}
