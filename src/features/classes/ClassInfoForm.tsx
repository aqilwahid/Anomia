"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Save, Trash2 } from "lucide-react";
import { localStore } from "@/store/localStore";
import { notifyDataChanged } from "@/store/events";
import type { ClassGroup } from "@/domain/participant";
import type { TableLayoutTemplate } from "@/domain/layout";
import { Button } from "@/ui/Button";
import { useConfirm, useToast } from "@/ui/Providers";
import { TemplatePreview } from "@/features/seating/TemplatePreview";
import { LAYOUT_TEMPLATES } from "./layoutTemplates";

const inputClass =
  "w-full h-11 px-3.5 bg-surface-slate border border-transparent rounded-lg text-on-surface font-body-md text-body-md placeholder:text-outline focus:bg-surface-card focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/30 transition-all";

export function ClassInfoForm({ classGroup }: { classGroup?: ClassGroup }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const isEdit = !!classGroup;
  const [name, setName] = useState(classGroup?.name ?? "");
  const [scheduleLabel, setScheduleLabel] = useState(classGroup?.scheduleLabel ?? "");
  const [room, setRoom] = useState(classGroup?.room ?? "");
  const [estimatedParticipants, setEstimatedParticipants] = useState<number>(classGroup?.estimatedParticipants ?? 24);
  const [tableLayout, setTableLayout] = useState<TableLayoutTemplate>(classGroup?.tableLayout ?? "banquet");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    const estimate = Number.isFinite(estimatedParticipants) && estimatedParticipants > 0 ? Math.round(estimatedParticipants) : null;
    try {
      if (isEdit && classGroup) {
        await localStore.updateClassGroup(classGroup.id, {
          name: trimmed,
          scheduleLabel: scheduleLabel.trim() || null,
          room: room.trim() || null,
          estimatedParticipants: estimate,
          tableLayout,
        });
        notifyDataChanged();
        toast.show({ message: "Info kelas disimpan", tone: "success" });
        router.refresh();
      } else {
        const created = await localStore.createClassGroup({
          name: trimmed,
          scheduleLabel: scheduleLabel.trim() || null,
          room: room.trim() || null,
          estimatedParticipants: estimate,
          tableLayout,
        });
        router.push(`/classes/${created.id}/participants`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!classGroup) return;
    const ok = await confirm({
      title: `Hapus kelas "${classGroup.name}"?`,
      message:
        "Semua peserta, foto, data wajah, dan denah kelas ini akan dihapus permanen dari browser ini. Tindakan ini tidak bisa dibatalkan.",
      confirmLabel: "Hapus permanen",
      tone: "danger",
    });
    if (!ok) return;
    await localStore.deleteClassGroup(classGroup.id);
    toast.show({ message: "Kelas dihapus", tone: "success" });
    router.push("/");
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-card rounded-2xl p-space-lg md:p-space-xl shadow-sm border border-border-subtle flex flex-col gap-space-lg">
      <div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
          {isEdit ? "Info Kelas" : "Buat Kelas Baru"}
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">
          {isEdit
            ? "Perbarui data dasar kelas pelatihan ini."
            : "Isi data dasar kelas — peserta, foto, dan denah bisa diatur di langkah berikutnya."}
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-label-lg text-label-lg text-on-surface">
          Nama Kelas / Pelatihan <span className="text-error">*</span>
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Contoh: Leadership & Agile Training — Batch 14"
          className={inputClass}
        />
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
        <label className="flex flex-col gap-1.5">
          <span className="font-label-lg text-label-lg text-on-surface">Tanggal &amp; Durasi</span>
          <input
            value={scheduleLabel}
            onChange={(e) => setScheduleLabel(e.target.value)}
            placeholder="Contoh: 14–16 Okt 2026 (3 hari)"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-label-lg text-label-lg text-on-surface">Lokasi / Ruangan</span>
          <input
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="Contoh: Ruang Cendrawasih Lt. 2"
            className={inputClass}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-label-lg text-label-lg text-on-surface">Perkiraan Jumlah Peserta</span>
          <span className="font-label-md text-label-md text-primary">{estimatedParticipants || 0} peserta</span>
        </div>
        <div className="flex items-center gap-space-sm">
          <input
            type="range"
            min={4}
            max={60}
            step={1}
            value={Math.min(60, Math.max(4, estimatedParticipants || 4))}
            onChange={(e) => setEstimatedParticipants(Number(e.target.value))}
            className="flex-1 accent-primary cursor-pointer"
            aria-label="Perkiraan jumlah peserta"
          />
          <input
            type="number"
            min={1}
            max={200}
            value={estimatedParticipants || ""}
            onChange={(e) => setEstimatedParticipants(Number(e.target.value))}
            className="w-20 h-10 text-center bg-surface-slate rounded-lg font-label-lg text-label-lg focus:outline-none focus:ring-2 focus:ring-border-focus"
            aria-label="Jumlah peserta"
          />
        </div>
        <p className="text-body-sm text-on-surface-variant">Dipakai untuk menyiapkan jumlah meja & kursi di denah awal.</p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-label-lg text-label-lg text-on-surface">Layout Ruangan Awal</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-space-sm">
          {LAYOUT_TEMPLATES.map((t) => {
            const active = tableLayout === t.value;
            return (
              <button
                type="button"
                key={t.value}
                onClick={() => setTableLayout(t.value)}
                aria-pressed={active}
                className={`flex flex-col text-left p-2.5 rounded-xl border transition-all ${
                  active
                    ? "border-primary-container bg-surface-container-low ring-2 ring-primary-container/20"
                    : "border-border-subtle bg-surface-card hover:border-outline-variant hover:bg-surface-slate"
                }`}
              >
                <span className="block w-full aspect-[4/3] rounded-lg bg-surface-slate p-1.5 mb-2">
                  <TemplatePreview
                    template={t.value}
                    participants={Math.min(40, Math.max(8, estimatedParticipants || 24))}
                    active={active}
                    className="w-full h-full"
                  />
                </span>
                <span className="font-label-lg text-label-lg text-on-surface">{t.label}</span>
                <span className="text-body-sm text-on-surface-variant mt-0.5 leading-snug">{t.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between pt-space-md border-t border-border-subtle gap-space-sm">
        {isEdit ? (
          <Button variant="dangerGhost" icon={Trash2} onClick={handleDelete}>
            Hapus kelas
          </Button>
        ) : (
          <span className="text-body-sm text-on-surface-variant">Tersimpan hanya di browser ini.</span>
        )}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={saving || !name.trim()}
          iconRight={isEdit ? Save : ArrowRight}
        >
          {isEdit ? "Simpan Perubahan" : "Lanjut: Peserta & Foto"}
        </Button>
      </div>
    </form>
  );
}
