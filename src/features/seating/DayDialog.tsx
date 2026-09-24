"use client";

import { useState } from "react";
import type { SeatingDay, TableLayoutTemplate } from "@/domain/layout";
import type { NewDayMode } from "@/store/store";
import { Modal } from "@/ui/Modal";
import { Button } from "@/ui/Button";
import { LAYOUT_TEMPLATES } from "@/features/classes/layoutTemplates";

export type NewDayRequest =
  | { kind: "copy"; label: string; sourceDayId: string; mode: NewDayMode }
  | { kind: "template"; label: string; template: TableLayoutTemplate };

const fieldClass =
  "w-full h-10 px-3 bg-surface-slate border border-border-subtle rounded-lg text-body-md focus:bg-surface-card focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/30";

function NewDayForm({
  days,
  activeDayId,
  defaultTemplate,
  onSubmit,
  onClose,
}: {
  days: SeatingDay[];
  activeDayId: string | null;
  defaultTemplate: TableLayoutTemplate;
  onSubmit: (req: NewDayRequest) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(`Day ${days.length + 1}`);
  const [source, setSource] = useState<string>(activeDayId ?? days[0]?.id ?? "template");
  const [mode, setMode] = useState<NewDayMode>("shuffle");
  const [template, setTemplate] = useState<TableLayoutTemplate>(defaultTemplate);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const name = label.trim() || `Day ${days.length + 1}`;
        if (source === "template") onSubmit({ kind: "template", label: name, template });
        else onSubmit({ kind: "copy", label: name, sourceDayId: source, mode });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-label-md font-label-md text-on-surface">Nama sesi / hari</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} className={fieldClass} data-autofocus />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-label-md font-label-md text-on-surface">Denah awal</span>
        <select value={source} onChange={(e) => setSource(e.target.value)} className={fieldClass}>
          {days.map((d) => (
            <option key={d.id} value={d.id}>
              Salin denah dari {d.label}
            </option>
          ))}
          <option value="template">Denah baru dari template…</option>
        </select>
      </label>
      {source === "template" ? (
        <label className="flex flex-col gap-1">
          <span className="text-label-md font-label-md text-on-surface">Template</span>
          <select value={template} onChange={(e) => setTemplate(e.target.value as TableLayoutTemplate)} className={fieldClass}>
            {LAYOUT_TEMPLATES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} — {t.description}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-label-md font-label-md text-on-surface mb-1">Posisi duduk peserta</legend>
          {(
            [
              ["shuffle", "Acak / rotasi", "Meja sama, peserta dapat teman duduk baru (cocok untuk ice breaking)"],
              ["copy", "Sama seperti sebelumnya", "Semua peserta duduk di kursi yang sama"],
              ["empty", "Kosongkan", "Meja disalin, kursi dikosongkan untuk diatur ulang"],
            ] as Array<[NewDayMode, string, string]>
          ).map(([value, title, desc]) => (
            <label
              key={value}
              className={`flex items-start gap-2.5 rounded-xl border p-2.5 cursor-pointer ${
                mode === value ? "border-primary-container bg-surface-container-low" : "border-border-subtle hover:bg-surface-slate"
              }`}
            >
              <input type="radio" name="day-mode" checked={mode === value} onChange={() => setMode(value)} className="mt-1 accent-primary" />
              <span>
                <span className="block text-label-lg font-label-lg text-on-surface">{title}</span>
                <span className="block text-body-sm text-on-surface-variant">{desc}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onClose}>
          Batal
        </Button>
        <Button type="submit" variant="primary">
          Buat sesi
        </Button>
      </div>
    </form>
  );
}

export function NewDayDialog(props: {
  open: boolean;
  days: SeatingDay[];
  activeDayId: string | null;
  defaultTemplate: TableLayoutTemplate;
  onSubmit: (req: NewDayRequest) => void;
  onClose: () => void;
}) {
  return (
    <Modal open={props.open} onClose={props.onClose} title="Tambah sesi / hari" description="Setiap hari bisa punya denah dan posisi duduk sendiri.">
      {props.open && <NewDayForm {...props} />}
    </Modal>
  );
}

export function RenameDayDialog({
  day,
  onSubmit,
  onClose,
}: {
  day: SeatingDay | null;
  onSubmit: (label: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal open={!!day} onClose={onClose} title="Ganti nama sesi" size="sm">
      {day && <RenameForm key={day.id} initial={day.label} onSubmit={onSubmit} onClose={onClose} />}
    </Modal>
  );
}

function RenameForm({ initial, onSubmit, onClose }: { initial: string; onSubmit: (label: string) => void; onClose: () => void }) {
  const [label, setLabel] = useState(initial);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (label.trim()) onSubmit(label.trim());
      }}
    >
      <input value={label} onChange={(e) => setLabel(e.target.value)} className={fieldClass} data-autofocus />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Batal
        </Button>
        <Button type="submit" variant="primary" disabled={!label.trim()}>
          Simpan
        </Button>
      </div>
    </form>
  );
}
