"use client";

import { useState } from "react";
import { Copy, Minus, Plus, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import type { SeatingTable, TableLayoutTemplate, TableShape } from "@/domain/layout";
import { Button } from "@/ui/Button";
import { LAYOUT_TEMPLATES } from "@/features/classes/layoutTemplates";
import { TemplatePreview } from "./TemplatePreview";

export const SHAPES: Array<{ value: TableShape; label: string; hint: string }> = [
  { value: "round", label: "Meja bundar", hint: "kursi melingkar" },
  { value: "rect", label: "Meja panjang", hint: "kursi di dua sisi" },
  { value: "row", label: "Meja baris", hint: "kursi di satu sisi" },
  { value: "chairs", label: "Deret kursi", hint: "tanpa meja" },
];

function ShapeIcon({ shape, className = "" }: { shape: TableShape; className?: string }) {
  return (
    <svg viewBox="0 0 40 28" className={className} aria-hidden>
      {shape === "round" && (
        <>
          <circle cx="20" cy="14" r="7" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.5" />
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
            return <circle key={i} cx={20 + 11 * Math.cos(a)} cy={14 + 11 * Math.sin(a)} r="2.4" fill="#64748b" />;
          })}
        </>
      )}
      {shape === "rect" && (
        <>
          <rect x="8" y="10" width="24" height="8" rx="2" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.5" />
          {[12, 20, 28].map((x) => (
            <g key={x}>
              <circle cx={x} cy="5" r="2.4" fill="#64748b" />
              <circle cx={x} cy="23" r="2.4" fill="#64748b" />
            </g>
          ))}
        </>
      )}
      {shape === "row" && (
        <>
          <rect x="6" y="7" width="28" height="7" rx="2" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.5" />
          {[12, 20, 28].map((x) => (
            <circle key={x} cx={x} cy="20" r="2.4" fill="#64748b" />
          ))}
        </>
      )}
      {shape === "chairs" && [8, 16, 24, 32].map((x) => <circle key={x} cx={x} cy="14" r="3" fill="#64748b" />)}
    </svg>
  );
}

function NumberStepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  label,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <Button
        variant="secondary"
        size="sm"
        iconOnly
        icon={Minus}
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={disabled || value <= min}
      >
        {`Kurangi ${label}`}
      </Button>
      <span className="min-w-[56px] text-center font-label-lg text-label-lg tabular-nums">{format ? format(value) : value}</span>
      <Button
        variant="secondary"
        size="sm"
        iconOnly
        icon={Plus}
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={disabled || value >= max}
      >
        {`Tambah ${label}`}
      </Button>
    </div>
  );
}

export function LayoutPanel({
  template,
  participantCount,
  roomWidth,
  roomDepth,
  minRoom,
  selectedTable,
  occupiedInSelected,
  locked,
  onApplyTemplate,
  onRoomSize,
  onAddTable,
  onUpdateTable,
  onRenameTable,
  onDuplicateTable,
  onDeleteTable,
  selectedInstructor,
  instructorPosition = "top",
  instructorLabel = "Instruktur",
  onSetInstructorPlacement,
  onUpdateInstructorLabel,
}: {
  template: TableLayoutTemplate;
  participantCount: number;
  roomWidth: number;
  roomDepth: number;
  minRoom: { width: number; depth: number };
  selectedTable: SeatingTable | null;
  occupiedInSelected: number;
  locked: boolean;
  onApplyTemplate: (t: TableLayoutTemplate) => void;
  onRoomSize: (width: number, depth: number) => void;
  onAddTable: (shape: TableShape) => void;
  onUpdateTable: (patch: Partial<Pick<SeatingTable, "name" | "seatCount" | "shape" | "rotation">>) => void;
  /** by id: the name input may blur after the selection already moved to another table */
  onRenameTable: (tableId: string, name: string) => void;
  onDuplicateTable: () => void;
  onDeleteTable: () => void;
  selectedInstructor?: boolean;
  instructorPosition?: "top" | "bottom" | "custom";
  instructorLabel?: string;
  onSetInstructorPlacement?: (pos: "top" | "bottom") => void;
  onUpdateInstructorLabel?: (label: string) => void;
}) {
  const [nameDraft, setNameDraft] = useState<{ id: string; value: string } | null>(null);
  const [instructorLabelDraft, setInstructorLabelDraft] = useState<string | null>(null);
  const tableName = selectedTable ? (nameDraft?.id === selectedTable.id ? nameDraft.value : selectedTable.name) : "";

  function commitName() {
    if (!nameDraft) return;
    const v = nameDraft.value.trim();
    if (v) onRenameTable(nameDraft.id, v);
    setNameDraft(null);
  }

  return (
    <div className="flex flex-col gap-space-md">
      {/* Selected Instructor Panel */}
      {selectedInstructor && (
        <section className="rounded-2xl bg-surface-card border-2 border-primary p-space-md shadow-xs flex flex-col gap-3 animate-pop-in">
          <div className="flex items-center justify-between">
            <h3 className="font-label-lg text-label-lg text-on-surface flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-primary" />
              Instruktur & Layar
            </h3>
            <span className="text-body-sm px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              Terpilih
            </span>
          </div>

          <div>
            <label className="block text-body-sm text-on-surface-variant mb-1.5">
              Posisi di Ruangan:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={locked}
                onClick={() => onSetInstructorPlacement?.("top")}
                className={`py-2 px-3 rounded-lg border font-label-md text-label-md flex items-center justify-center gap-1.5 transition-colors ${
                  instructorPosition === "top"
                    ? "bg-primary-container text-on-primary border-primary font-bold shadow-xs"
                    : "bg-surface-slate text-on-surface border-border-subtle hover:bg-surface-container"
                }`}
              >
                ↑ Di Atas (Depan)
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => onSetInstructorPlacement?.("bottom")}
                className={`py-2 px-3 rounded-lg border font-label-md text-label-md flex items-center justify-center gap-1.5 transition-colors ${
                  instructorPosition === "bottom"
                    ? "bg-primary-container text-on-primary border-primary font-bold shadow-xs"
                    : "bg-surface-slate text-on-surface border-border-subtle hover:bg-surface-container"
                }`}
              >
                ↓ Di Bawah (Belakang)
              </button>
            </div>
            {instructorPosition === "custom" && (
              <p className="text-[11px] text-primary mt-1 font-medium">
                Posisi bebas (telah digeser manual)
              </p>
            )}
          </div>

          <div>
            <label className="block text-body-sm text-on-surface-variant mb-1">Label Meja:</label>
            <input
              value={instructorLabelDraft ?? instructorLabel}
              onChange={(e) => setInstructorLabelDraft(e.target.value)}
              onBlur={() => {
                if (instructorLabelDraft !== null) {
                  onUpdateInstructorLabel?.(instructorLabelDraft.trim() || "Instruktur");
                  setInstructorLabelDraft(null);
                }
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
              disabled={locked}
              placeholder="Instruktur"
              className="w-full h-10 px-3 bg-surface-slate border border-border-subtle rounded-lg font-label-lg text-label-lg focus:bg-surface-card focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/30"
            />
          </div>

          <p className="text-body-sm text-on-surface-variant bg-surface-slate p-2.5 rounded-lg border border-border-subtle">
            💡 Meja instruktur dapat <strong>diseret langsung</strong> di denah ke posisi mana saja sesuai ruangan asli.
          </p>
        </section>
      )}

      {selectedTable && (
        <section className="rounded-2xl bg-surface-card border-2 border-primary-container/40 p-space-md shadow-xs flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-label-lg text-label-lg text-on-surface">Meja terpilih</h3>
            <span className="text-body-sm text-on-surface-variant">
              {occupiedInSelected}/{selectedTable.seatCount} terisi
            </span>
          </div>
          <input
            value={tableName}
            onChange={(e) => setNameDraft({ id: selectedTable.id, value: e.target.value })}
            onBlur={commitName}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            disabled={locked}
            aria-label="Nama meja"
            className="w-full h-10 px-3 bg-surface-slate border border-border-subtle rounded-lg font-label-lg text-label-lg focus:bg-surface-card focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/30"
          />
          <div className="grid grid-cols-4 gap-1.5">
            {SHAPES.map((s) => (
              <button
                key={s.value}
                type="button"
                disabled={locked}
                onClick={() => onUpdateTable({ shape: s.value })}
                className={`flex flex-col items-center gap-0.5 rounded-lg border p-1.5 text-[11px] leading-tight ${
                  (selectedTable.shape ?? "round") === s.value
                    ? "border-primary-container bg-surface-container-low text-primary"
                    : "border-border-subtle hover:bg-surface-slate text-on-surface-variant"
                }`}
                title={`${s.label} (${s.hint})`}
              >
                <ShapeIcon shape={s.value} className="w-9 h-6" />
                {s.label.replace("Meja ", "")}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-body-md text-on-surface">Jumlah kursi</span>
            <NumberStepper
              label="kursi"
              value={selectedTable.seatCount}
              min={1}
              max={30}
              disabled={locked}
              onChange={(v) => onUpdateTable({ seatCount: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-body-md text-on-surface">Rotasi</span>
            <div className="flex items-center gap-1">
              <Button variant="secondary" size="sm" iconOnly icon={RotateCcw} disabled={locked} onClick={() => onUpdateTable({ rotation: ((selectedTable.rotation ?? 0) - 15 + 360) % 360 })}>
                Putar kiri 15°
              </Button>
              <span className="min-w-[48px] text-center font-label-lg text-label-lg tabular-nums">{Math.round(selectedTable.rotation ?? 0)}°</span>
              <Button variant="secondary" size="sm" iconOnly icon={RotateCw} disabled={locked} onClick={() => onUpdateTable({ rotation: ((selectedTable.rotation ?? 0) + 15) % 360 })}>
                Putar kanan 15°
              </Button>
              <Button variant="secondary" size="sm" disabled={locked} onClick={() => onUpdateTable({ rotation: ((selectedTable.rotation ?? 0) + 90) % 360 })}>
                90°
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" icon={Copy} onClick={onDuplicateTable} disabled={locked}>
              Duplikat
            </Button>
            <Button variant="secondary" size="sm" icon={Trash2} onClick={onDeleteTable} disabled={locked} className="hover:text-error">
              Hapus meja
            </Button>
          </div>
          <p className="text-body-sm text-on-surface-variant">
            Seret meja di denah untuk memindah. Keyboard: panah = geser, R = putar 90°, Del = hapus.
          </p>
        </section>
      )}

      <section className="rounded-2xl bg-surface-card border border-border-subtle p-space-md shadow-xs flex flex-col gap-2">
        <h3 className="font-label-lg text-label-lg text-on-surface">Tambah meja / kursi</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {SHAPES.map((s) => (
            <button
              key={s.value}
              type="button"
              disabled={locked}
              onClick={() => onAddTable(s.value)}
              className="flex items-center gap-2 rounded-xl border border-border-subtle p-2 text-left hover:border-primary-container hover:bg-surface-container-low disabled:opacity-40"
            >
              <ShapeIcon shape={s.value} className="w-10 h-7 shrink-0" />
              <span className="min-w-0">
                <span className="block text-label-md font-label-md text-on-surface">{s.label}</span>
                <span className="block text-[11px] text-on-surface-variant">{s.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Instructor Placement Quick Settings (when instructor is not currently focused) */}
      {!selectedInstructor && (
        <section className="rounded-2xl bg-surface-card border border-border-subtle p-space-md shadow-xs flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h3 className="font-label-lg text-label-lg text-on-surface">Posisi Instruktur & Layar</h3>
            <span className="text-body-sm text-on-surface-variant">
              {instructorPosition === "bottom" ? "Di Bawah" : instructorPosition === "custom" ? "Bebas" : "Di Atas"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={locked}
              onClick={() => onSetInstructorPlacement?.("top")}
              className={`py-2 px-3 rounded-lg border font-label-md text-label-md flex items-center justify-center gap-1.5 transition-colors ${
                instructorPosition === "top"
                  ? "bg-primary-container text-on-primary border-primary font-bold shadow-xs"
                  : "bg-surface-slate text-on-surface border-border-subtle hover:bg-surface-container"
              }`}
            >
              ↑ Di Atas (Depan)
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={() => onSetInstructorPlacement?.("bottom")}
              className={`py-2 px-3 rounded-lg border font-label-md text-label-md flex items-center justify-center gap-1.5 transition-colors ${
                instructorPosition === "bottom"
                  ? "bg-primary-container text-on-primary border-primary font-bold shadow-xs"
                  : "bg-surface-slate text-on-surface border-border-subtle hover:bg-surface-container"
              }`}
            >
              ↓ Di Bawah (Belakang)
            </button>
          </div>
          <p className="text-[11px] text-on-surface-variant">
            Atau klik/seret elemen instruktur di denah untuk memindahkan ke mana saja.
          </p>
        </section>
      )}

      <section className="rounded-2xl bg-surface-card border border-border-subtle p-space-md shadow-xs flex flex-col gap-3">
        <h3 className="font-label-lg text-label-lg text-on-surface">Ukuran ruangan</h3>
        <div className="flex items-center justify-between">
          <span className="text-body-md text-on-surface">Lebar (sisi layar)</span>
          <NumberStepper
            label="lebar"
            value={roomWidth}
            min={Math.ceil(minRoom.width / 50) * 50}
            max={3000}
            step={50}
            format={(v) => `${(v / 100).toLocaleString("id-ID")} m`}
            disabled={locked}
            onChange={(v) => onRoomSize(v, roomDepth)}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-body-md text-on-surface">Panjang (depan–belakang)</span>
          <NumberStepper
            label="panjang"
            value={roomDepth}
            min={Math.ceil(minRoom.depth / 50) * 50}
            max={3000}
            step={50}
            format={(v) => `${(v / 100).toLocaleString("id-ID")} m`}
            disabled={locked}
            onChange={(v) => onRoomSize(roomWidth, v)}
          />
        </div>
      </section>

      <section className="rounded-2xl bg-surface-card border border-border-subtle p-space-md shadow-xs flex flex-col gap-2">
        <div>
          <h3 className="font-label-lg text-label-lg text-on-surface">Template denah</h3>
          <p className="text-body-sm text-on-surface-variant">
            Menyusun ulang semua meja untuk {participantCount} peserta. Peserta yang sudah duduk ditempatkan ulang berurutan.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {LAYOUT_TEMPLATES.map((t) => {
            const active = t.value === template;
            return (
              <button
                key={t.value}
                type="button"
                disabled={locked}
                onClick={() => onApplyTemplate(t.value)}
                className={`flex flex-col rounded-xl border p-1.5 text-left disabled:opacity-40 ${
                  active ? "border-primary-container bg-surface-container-low" : "border-border-subtle hover:bg-surface-slate"
                }`}
                title={t.description}
              >
                <span className="block aspect-[4/3] w-full rounded-lg bg-surface-slate p-1">
                  <TemplatePreview template={t.value} participants={Math.max(8, participantCount)} active={active} className="w-full h-full" />
                </span>
                <span className={`mt-1 px-0.5 text-label-md font-label-md ${active ? "text-primary" : "text-on-surface"}`}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
