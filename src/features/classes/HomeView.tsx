"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, Lightbulb, MapPin, Trash2, Users } from "lucide-react";
import { localStore } from "@/store/localStore";
import type { ClassStats } from "@/store/store";
import type { ClassGroup } from "@/domain/participant";
import { useConfirm, useToast } from "@/ui/Providers";
import { TemplatePreview } from "@/features/seating/TemplatePreview";
import { layoutTemplateMeta } from "./layoutTemplates";
import { ClassInfoForm } from "./ClassInfoForm";

type Row = { classGroup: ClassGroup; stats: ClassStats };

export function HomeView() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const confirm = useConfirm();
  const toast = useToast();

  const load = useCallback(async () => {
    const classes = await localStore.listClassGroups();
    const stats = await Promise.all(classes.map((c) => localStore.getClassStats(c.id)));
    setRows(classes.map((classGroup, i) => ({ classGroup, stats: stats[i] })));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load from IndexedDB
    load();
  }, [load]);

  async function handleDelete(c: ClassGroup) {
    const ok = await confirm({
      title: `Hapus kelas "${c.name}"?`,
      message: "Semua peserta, foto, data wajah, dan denah kelas ini dihapus permanen dari browser ini.",
      confirmLabel: "Hapus permanen",
      tone: "danger",
    });
    if (!ok) return;
    await localStore.deleteClassGroup(c.id);
    toast.show({ message: `Kelas "${c.name}" dihapus`, tone: "success" });
    load();
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-layout-gutter-mobile md:px-layout-gutter-desktop py-space-lg md:py-space-xl">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">
        <section className="lg:col-span-7 xl:col-span-8 order-2 lg:order-1">
          <ClassInfoForm />
        </section>

        <aside className="lg:col-span-5 xl:col-span-4 flex flex-col gap-space-md order-1 lg:order-2">
          <div className="flex items-center gap-2 px-1">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Kelas Anda</h2>
            {rows && rows.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm">
                {rows.length}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-space-sm">
            {rows === null && (
              <div className="h-24 rounded-2xl bg-surface-card border border-border-subtle animate-pulse" />
            )}
            {rows?.length === 0 && (
              <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-card p-space-lg text-center">
                <p className="font-label-lg text-label-lg text-on-surface">Belum ada kelas</p>
                <p className="text-body-sm text-on-surface-variant mt-1">Buat kelas pertama lewat form di samping.</p>
              </div>
            )}
            {rows?.map(({ classGroup: c, stats }) => {
              const template = layoutTemplateMeta(c.tableLayout);
              const pct = stats.faces ? Math.round((stats.labeledFaces / stats.faces) * 100) : 0;
              return (
                <article
                  key={c.id}
                  className="group relative rounded-2xl bg-surface-card border border-border-subtle shadow-xs hover:shadow-md hover:border-outline-variant transition-all"
                >
                  <Link href={`/classes/${c.id}`} className="flex gap-3 p-space-md pr-12">
                    <span className="w-16 h-12 shrink-0 rounded-lg bg-surface-slate p-1" title={template.label}>
                      <TemplatePreview template={c.tableLayout} participants={Math.max(8, stats.participants || c.estimatedParticipants || 16)} className="w-full h-full" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-label-lg text-label-lg text-on-surface truncate group-hover:text-primary">
                        {c.name}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-body-sm text-on-surface-variant">
                        {c.scheduleLabel && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays size={13} aria-hidden /> {c.scheduleLabel}
                          </span>
                        )}
                        {c.room && (
                          <span className="inline-flex items-center gap-1 truncate max-w-[180px]">
                            <MapPin size={13} aria-hidden /> {c.room}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Users size={13} aria-hidden /> {stats.participants} peserta
                        </span>
                      </span>
                      <span className="mt-2 flex items-center gap-2">
                        <span className="h-1.5 flex-1 rounded-full bg-surface-container-high overflow-hidden">
                          <span className="block h-full rounded-full bg-primary-container" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="text-label-sm font-label-sm text-on-surface-variant whitespace-nowrap">
                          {stats.faces ? `${pct}% wajah dinamai` : "Belum ada foto"}
                        </span>
                      </span>
                    </span>
                    <ChevronRight size={18} className="self-center text-outline group-hover:text-primary shrink-0" aria-hidden />
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(c)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg text-outline opacity-70 hover:opacity-100 hover:text-error hover:bg-error-container/50 focus-visible:opacity-100"
                    aria-label={`Hapus kelas ${c.name}`}
                    title="Hapus kelas"
                  >
                    <Trash2 size={15} />
                  </button>
                </article>
              );
            })}
          </div>

          <div className="p-space-md bg-surface-container-low rounded-2xl flex items-start gap-space-sm">
            <Lightbulb size={18} className="text-primary shrink-0 mt-0.5" aria-hidden />
            <div className="flex flex-col gap-0.5">
              <h3 className="font-label-lg text-label-lg text-on-surface">Alur singkat</h3>
              <p className="text-body-sm text-on-surface-variant leading-relaxed">
                Impor daftar nama → unggah foto kelas → pasangkan nama ke wajah → atur denah ruangan. Denah tiap hari
                (Day 1, Day 2, …) bisa berbeda tanpa kehilangan data wajah.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
