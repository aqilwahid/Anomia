"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { localStore } from "@/store/localStore";
import type { ClassGroup } from "@/domain/participant";
import type { TableLayoutTemplate } from "@/domain/layout";
import { LAYOUT_TEMPLATES } from "./layoutTemplates";

export function ClassInfoForm({ classGroup }: { classGroup?: ClassGroup }) {
  const router = useRouter();
  const isEdit = !!classGroup;
  const [name, setName] = useState(classGroup?.name ?? "");
  const [scheduleLabel, setScheduleLabel] = useState(classGroup?.scheduleLabel ?? "");
  const [room, setRoom] = useState(classGroup?.room ?? "");
  const [estimatedParticipants, setEstimatedParticipants] = useState(classGroup?.estimatedParticipants ?? 24);
  const [tableLayout, setTableLayout] = useState<TableLayoutTemplate>(classGroup?.tableLayout ?? "banquet");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      if (isEdit && classGroup) {
        await localStore.updateClassGroup(classGroup.id, {
          name: trimmed,
          scheduleLabel: scheduleLabel.trim() || null,
          room: room.trim() || null,
          estimatedParticipants,
          tableLayout,
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        const created = await localStore.createClassGroup({
          name: trimmed,
          scheduleLabel: scheduleLabel.trim() || null,
          room: room.trim() || null,
          estimatedParticipants,
          tableLayout,
        });
        router.push(`/classes/${created.id}/participants`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface-card rounded-xl p-space-lg md:p-space-xl shadow-sm flex flex-col gap-space-md"
    >
      <div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
          {isEdit ? "Info Kelas" : "Buat Kelas Baru"}
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">
          {isEdit
            ? "Perbarui data dasar kelas pelatihan ini."
            : "Siapkan data dasar kelas pelatihan Anda dalam hitungan detik."}
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
          placeholder="Contoh: Leadership & Agile Training 2025"
          className="w-full px-space-md py-2.5 bg-surface-slate rounded-lg text-on-surface font-body-md text-body-md focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-border-focus transition-all"
        />
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
        <label className="flex flex-col gap-1.5">
          <span className="font-label-lg text-label-lg text-on-surface">Tanggal &amp; Durasi Pelatihan</span>
          <input
            value={scheduleLabel}
            onChange={(e) => setScheduleLabel(e.target.value)}
            placeholder="Contoh: 3 Hari (Day 1 - Day 3)"
            className="w-full px-space-md py-2.5 bg-surface-slate rounded-lg text-on-surface font-body-md text-body-md focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-border-focus transition-all"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-label-lg text-label-lg text-on-surface">Lokasi / Ruangan</span>
          <input
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="Contoh: Ruang Cendrawasih Lt. 2"
            className="w-full px-space-md py-2.5 bg-surface-slate rounded-lg text-on-surface font-body-md text-body-md focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-border-focus transition-all"
          />
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-label-lg text-label-lg text-on-surface">Estimasi Jumlah Peserta</span>
          <span className="font-label-md text-label-md text-primary font-bold">{estimatedParticipants} Peserta</span>
        </div>
        <div className="grid grid-cols-4 gap-space-xs items-center">
          <input
            type="range"
            min={6}
            max={60}
            step={2}
            value={estimatedParticipants}
            onChange={(e) => setEstimatedParticipants(Number(e.target.value))}
            className="col-span-3 accent-primary cursor-pointer"
          />
          <input
            type="number"
            min={1}
            max={100}
            value={estimatedParticipants}
            onChange={(e) => setEstimatedParticipants(Number(e.target.value))}
            className="col-span-1 text-center bg-surface-slate rounded-lg py-2 font-label-md text-label-md focus:outline-none focus:ring-2 focus:ring-border-focus"
          />
        </div>
      </div>

      <div className="flex flex-col gap-space-xs pt-space-xs">
        <span className="font-label-lg text-label-lg text-on-surface">Pilihan Layout Meja Awal</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-space-sm">
          {LAYOUT_TEMPLATES.map((t) => {
            const active = tableLayout === t.value;
            return (
              <button
                type="button"
                key={t.value}
                onClick={() => setTableLayout(t.value)}
                className={`flex flex-col text-left p-space-sm rounded-lg transition-all ${
                  active ? "bg-surface-container-low shadow-sm" : "bg-surface-slate hover:bg-surface-container-low"
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[28px] mb-space-xs ${
                    active ? "text-primary" : "text-outline"
                  }`}
                >
                  {t.icon}
                </span>
                <span className="font-label-md text-label-md text-on-surface font-semibold">{t.label}</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{t.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between pt-space-md mt-space-xs gap-space-sm">
        <div className="flex items-center gap-1.5 text-on-surface-variant font-body-sm text-body-sm self-start sm:self-center">
          <span className="material-symbols-outlined text-[18px] text-confidence-high">cloud_done</span>
          {saved ? "Tersimpan" : "Tersimpan di IndexedDB browser"}
        </div>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-space-xs px-space-xl py-3 rounded-lg bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container disabled:opacity-40 shadow-sm transition-all"
        >
          <span>{isEdit ? "Simpan Perubahan" : "Lanjut: Input Peserta & Foto"}</span>
          <span className="material-symbols-outlined text-[18px]">
            {isEdit ? "save" : "arrow_forward"}
          </span>
        </button>
      </div>
    </form>
  );
}
