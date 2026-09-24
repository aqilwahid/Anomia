"use client";

import { useState } from "react";
import type { Participant, ParticipantDetails } from "@/domain/participant";
import { localStore } from "@/store/localStore";
import { notifyDataChanged } from "@/store/events";
import { Modal } from "@/ui/Modal";
import { Button } from "@/ui/Button";
import { Avatar } from "@/ui/Avatar";
import { useToast } from "@/ui/Providers";

const fieldClass =
  "w-full h-10 px-3 bg-surface-slate border border-border-subtle rounded-lg text-on-surface text-body-md placeholder:text-outline focus:bg-surface-card focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/30";

type Draft = Record<keyof ParticipantDetails, string>;

function toDraft(p?: Participant | null): Draft {
  return {
    displayName: p?.displayName ?? "",
    organization: p?.organization ?? "",
    jobTitle: p?.jobTitle ?? "",
    email: p?.email ?? "",
    phone: p?.phone ?? "",
    notes: p?.notes ?? "",
  };
}

function EditorForm({
  participant,
  classGroupId,
  faceUrl,
  onClose,
  onSaved,
}: {
  participant?: Participant | null;
  classGroupId: string;
  faceUrl?: string | null;
  onClose: () => void;
  onSaved?: (p: Participant | null) => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => toDraft(participant));
  const [saving, setSaving] = useState(false);
  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!draft.displayName.trim()) return;
    setSaving(true);
    try {
      if (participant) {
        await localStore.updateParticipant(participant.id, draft);
        onSaved?.(null);
      } else {
        const created = await localStore.createParticipant(classGroupId, draft);
        onSaved?.(created);
      }
      notifyDataChanged();
      toast.show({ message: participant ? "Data peserta disimpan" : "Peserta ditambahkan", tone: "success" });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id="participant-editor" onSubmit={save} className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar src={faceUrl} name={draft.displayName || "?"} size={56} />
        <label className="flex-1 flex flex-col gap-1">
          <span className="text-label-md font-label-md text-on-surface">
            Nama lengkap <span className="text-error">*</span>
          </span>
          <input value={draft.displayName} onChange={set("displayName")} required className={fieldClass} data-autofocus />
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-label-md font-label-md text-on-surface">Instansi / Divisi</span>
          <input value={draft.organization} onChange={set("organization")} placeholder="Mis. Dinas Kominfo" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label-md font-label-md text-on-surface">Jabatan</span>
          <input value={draft.jobTitle} onChange={set("jobTitle")} placeholder="Mis. Staf IT" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label-md font-label-md text-on-surface">Email</span>
          <input type="email" value={draft.email} onChange={set("email")} placeholder="nama@contoh.id" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label-md font-label-md text-on-surface">No. HP / WA</span>
          <input type="tel" value={draft.phone} onChange={set("phone")} placeholder="08…" className={fieldClass} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-label-md font-label-md text-on-surface">Catatan</span>
        <textarea
          value={draft.notes}
          onChange={set("notes")}
          rows={3}
          placeholder="Mis. kacamata, aktif bertanya, perlu duduk dekat colokan…"
          className={`${fieldClass} h-auto py-2 resize-none`}
        />
      </label>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose}>
          Batal
        </Button>
        <Button type="submit" variant="primary" disabled={saving || !draft.displayName.trim()}>
          {participant ? "Simpan" : "Tambah peserta"}
        </Button>
      </div>
    </form>
  );
}

/** Add / edit a participant with all detail fields. Shared by the roster and the seating plan. */
export function ParticipantEditor({
  open,
  onClose,
  participant,
  classGroupId,
  faceUrl,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  participant?: Participant | null;
  classGroupId: string;
  faceUrl?: string | null;
  onSaved?: (p: Participant | null) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={participant ? "Detail peserta" : "Tambah peserta"} size="md">
      {open && (
        <EditorForm
          key={participant?.id ?? "new"}
          participant={participant}
          classGroupId={classGroupId}
          faceUrl={faceUrl}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Modal>
  );
}
