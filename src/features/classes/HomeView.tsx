"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { localStore } from "@/store/localStore";
import type { ClassGroup } from "@/domain/participant";
import { layoutTemplateMeta } from "./layoutTemplates";
import { ClassInfoForm } from "./ClassInfoForm";

export function HomeView() {
  const [classes, setClasses] = useState<ClassGroup[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    localStore.listClassGroups().then((cgs) => {
      if (!cancelled) setClasses(cgs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="w-full max-w-7xl mx-auto px-layout-gutter-mobile md:px-layout-gutter-desktop py-space-lg md:py-space-xl">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">
        <section className="lg:col-span-8">
          <ClassInfoForm />
        </section>

        <aside className="lg:col-span-4 flex flex-col gap-space-md">
          <div className="flex items-center justify-between px-space-2xs">
            <div className="flex items-center gap-2">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Kelas Anda</h2>
              {classes && classes.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm font-bold">
                  {classes.length} Kelas
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-space-sm">
            {classes === null && (
              <p className="font-body-sm text-body-sm text-on-surface-variant px-space-2xs">Memuat…</p>
            )}
            {classes?.length === 0 && (
              <p className="font-body-sm text-body-sm text-on-surface-variant px-space-2xs">
                Belum ada kelas. Buat satu di form sebelah kiri.
              </p>
            )}
            {classes?.map((c) => {
              const template = layoutTemplateMeta(c.tableLayout);
              return (
                <Link key={c.id} href={`/classes/${c.id}`}>
                  <article className="p-space-md bg-surface-card rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer group">
                    <div className="flex items-start justify-between gap-space-xs">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-label-lg text-label-lg text-on-surface font-semibold truncate group-hover:text-primary transition-colors">
                          {c.name}
                        </h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1.5 mt-1 flex-wrap">
                          {c.scheduleLabel && (
                            <>
                              <span className="material-symbols-outlined text-[15px] text-outline">calendar_today</span>
                              <span>{c.scheduleLabel}</span>
                            </>
                          )}
                          {c.estimatedParticipants && (
                            <>
                              <span>•</span>
                              <span>{c.estimatedParticipants} Peserta</span>
                            </>
                          )}
                        </p>
                      </div>
                      <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors text-[20px] shrink-0 mt-1">
                        chevron_right
                      </span>
                    </div>
                    <div className="mt-space-sm pt-space-xs flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm">
                      <span className="flex items-center gap-1 text-outline font-label-sm text-label-sm">
                        <span className="material-symbols-outlined text-[14px]">{template.icon}</span>
                        {template.label}
                      </span>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>

          <div className="p-space-md bg-surface-container-low rounded-xl flex items-start gap-space-sm mt-space-xs">
            <span className="material-symbols-outlined text-primary text-[20px] shrink-0 mt-0.5">info</span>
            <div className="flex flex-col gap-0.5">
              <h4 className="font-label-md text-label-md text-on-surface font-semibold">Tips Fasilitator Cerdas</h4>
              <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                Anda bisa mengubah denah meja setiap pergantian hari (Day 1 ke Day 2) tanpa kehilangan riwayat data
                pengenalan wajah peserta.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
