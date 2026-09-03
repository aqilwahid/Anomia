"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { localStore } from "@/store/localStore";
import type { ClassGroup } from "@/domain/participant";

const STEPS = [
  { path: "", label: "1. Buat & Info Kelas" },
  { path: "/participants", label: "2. Peserta & Foto" },
  { path: "/labeling", label: "3. Labeling Wajah" },
  { path: "/seating", label: "4. Denah & Penempatan (Day 1-3)" },
];

export function ClassWizardShell({
  classGroupId,
  children,
}: {
  classGroupId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
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

  const basePath = `/classes/${classGroupId}`;

  return (
    <div className="flex flex-col w-full">
      <div className="bg-surface-card border-b border-border-subtle no-print">
        <div className="w-full max-w-7xl mx-auto px-layout-gutter-mobile md:px-layout-gutter-desktop py-space-sm flex flex-col md:flex-row md:items-center justify-between gap-space-sm">
          <div className="flex items-center gap-space-sm min-w-0">
            <Link href="/" className="font-label-sm text-label-sm text-on-surface-variant hover:text-on-surface hover:underline shrink-0">
              ← Semua kelas
            </Link>
            <span className="text-outline-variant">/</span>
            <span className="font-label-md text-label-md text-on-surface truncate">
              {classGroup === undefined ? "Memuat…" : classGroup === null ? "Kelas tidak ditemukan" : classGroup.name}
            </span>
            {classGroup && (
              <span className="inline-flex items-center gap-1.5 px-space-xs py-0.5 rounded-full bg-surface-container-low text-primary font-label-sm text-label-sm shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-confidence-high" />
                Aktif
              </span>
            )}
          </div>
          <div className="hidden md:flex items-center gap-1.5 px-space-sm py-space-2xs rounded-full bg-surface-slate text-on-surface-variant font-label-sm text-label-sm shrink-0">
            <span className="material-symbols-outlined text-confidence-high text-[16px]">lock</span>
            Local Browser Only
          </div>
        </div>
        <nav className="w-full max-w-7xl mx-auto px-layout-gutter-mobile md:px-layout-gutter-desktop pb-space-sm">
          <div className="flex flex-wrap items-center gap-space-2xs bg-surface-slate p-space-2xs rounded-xl">
            {STEPS.map((step) => {
              const href = `${basePath}${step.path}`;
              const active = pathname === href;
              return (
                <Link
                  key={step.path}
                  href={href}
                  className={`px-space-md py-space-xs rounded-lg font-label-md text-label-md transition-colors ${
                    active
                      ? "bg-primary-container text-on-primary-container"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {step.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
      <div className="flex-1">{classGroup === null ? <ClassNotFound /> : children}</div>
    </div>
  );
}

function ClassNotFound() {
  return (
    <div className="mx-auto max-w-4xl px-layout-gutter-desktop py-space-2xl">
      <p className="font-body-md text-body-md text-on-surface-variant">Kelas tidak ditemukan.</p>
      <Link href="/" className="font-label-md text-label-md text-primary hover:underline">
        Kembali ke daftar kelas
      </Link>
    </div>
  );
}
