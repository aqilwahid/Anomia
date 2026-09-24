"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronLeft } from "lucide-react";
import { localStore } from "@/store/localStore";
import { onDataChanged } from "@/store/events";
import type { ClassStats } from "@/store/store";
import type { ClassGroup } from "@/domain/participant";

const STEPS = [
  { path: "", label: "Info Kelas" },
  { path: "/participants", label: "Peserta & Foto" },
  { path: "/labeling", label: "Labeling Wajah" },
  { path: "/seating", label: "Denah Ruangan" },
  { path: "/report", label: "Laporan" },
] as const;

function stepMeta(index: number, stats: ClassStats | null, classGroup: ClassGroup | null) {
  if (!stats) return { done: false, hint: "" };
  switch (index) {
    case 0:
      return { done: true, hint: classGroup?.room || classGroup?.scheduleLabel || "Data dasar" };
    case 1:
      return {
        done: stats.participants > 0 && stats.photos > 0,
        hint: `${stats.participants} peserta · ${stats.photos} foto`,
      };
    case 2:
      return {
        done: stats.faces > 0 && stats.labeledFaces === stats.faces,
        hint: stats.faces ? `${stats.labeledFaces}/${stats.faces} wajah dinamai` : "Belum ada wajah",
      };
    case 3:
      return {
        done: stats.participants > 0 && stats.seated >= stats.participants,
        hint: stats.seatingDays ? `${stats.seated}/${stats.participants} sudah duduk` : "Belum ada denah",
      };
    default:
      return {
        done: Boolean(stats.reports && stats.reports > 0),
        hint: stats.reports ? `${stats.reports} laporan dibuat` : "Laporan & PDF",
      };
  }
}

export function ClassWizardShell({
  classGroupId,
  children,
}: {
  classGroupId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [classGroup, setClassGroup] = useState<ClassGroup | null | undefined>(undefined);
  const [stats, setStats] = useState<ClassStats | null>(null);

  const refresh = useCallback(async () => {
    const [cg, st] = await Promise.all([
      localStore.getClassGroup(classGroupId),
      localStore.getClassStats(classGroupId),
    ]);
    setClassGroup(cg ?? null);
    setStats(st);
  }, [classGroupId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load from IndexedDB on mount / navigation
    refresh();
  }, [refresh, pathname]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onDataChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 150);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [refresh]);

  const basePath = `/classes/${classGroupId}`;
  const activeIndex = Math.max(
    0,
    STEPS.findIndex((s) => (s.path ? pathname.startsWith(`${basePath}${s.path}`) : pathname === basePath))
  );

  return (
    <div className="flex flex-col w-full">
      <div className="bg-surface-card border-b border-border-subtle no-print">
        <div className="w-full max-w-[1400px] mx-auto px-layout-gutter-mobile md:px-layout-gutter-desktop pt-3 pb-2 flex items-center gap-2 min-w-0">
          <Link
            href="/"
            className="inline-flex items-center gap-0.5 text-label-md font-label-md text-on-surface-variant hover:text-primary shrink-0"
          >
            <ChevronLeft size={16} aria-hidden />
            Semua kelas
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="font-label-lg text-label-lg text-on-surface truncate">
            {classGroup === undefined ? "Memuat…" : classGroup === null ? "Kelas tidak ditemukan" : classGroup.name}
          </span>
        </div>
        <nav aria-label="Langkah kelas" className="w-full max-w-[1400px] mx-auto px-layout-gutter-mobile md:px-layout-gutter-desktop pb-3">
          <ol className="flex gap-1.5 overflow-x-auto scroll-thin -mx-1 px-1">
            {STEPS.map((step, i) => {
              const href = `${basePath}${step.path}`;
              const active = i === activeIndex;
              const meta = stepMeta(i, stats, classGroup ?? null);
              return (
                <li key={step.path} className="flex-1 min-w-[150px]">
                  <Link
                    href={href}
                    aria-current={active ? "step" : undefined}
                    className={`group flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors ${
                      active ? "bg-primary-container text-on-primary" : "bg-surface-slate hover:bg-surface-container-low"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-label-md font-label-md ${
                        active
                          ? "bg-white text-primary"
                          : meta.done
                            ? "bg-confidence-high text-white"
                            : "bg-surface-card text-on-surface-variant border border-border-subtle"
                      }`}
                    >
                      {meta.done && !active ? <Check size={15} strokeWidth={3} aria-label="selesai" /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={`block font-label-lg text-label-lg truncate ${active ? "text-white" : "text-on-surface"}`}>
                        {step.label}
                      </span>
                      <span
                        className={`block text-body-sm truncate ${active ? "text-on-primary-container/90" : "text-on-surface-variant"}`}
                      >
                        {meta.hint || " "}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
      <div className="flex-1">{classGroup === null ? <ClassNotFound /> : children}</div>
    </div>
  );
}

function ClassNotFound() {
  return (
    <div className="mx-auto max-w-4xl px-layout-gutter-desktop py-space-2xl">
      <p className="font-body-md text-body-md text-on-surface-variant">
        Kelas tidak ditemukan di browser ini. Data Anomia tersimpan per browser — buka dari perangkat/browser yang sama
        dengan saat kelas dibuat.
      </p>
      <Link href="/" className="font-label-md text-label-md text-primary hover:underline">
        Kembali ke daftar kelas
      </Link>
    </div>
  );
}
