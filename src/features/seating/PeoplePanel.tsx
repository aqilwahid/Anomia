"use client";

import { useMemo, useState } from "react";
import { Eraser, GripVertical, LocateFixed, Search, Shuffle, Sparkles, Wand2 } from "lucide-react";
import type { Participant } from "@/domain/participant";
import type { AutoAssignStrategy } from "@/store/store";
import type { ParticipantFaceInfo } from "@/features/classes/useClassData";
import { Avatar } from "@/ui/Avatar";
import { Button } from "@/ui/Button";
import { Menu } from "@/ui/Menu";

function fold(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function PeoplePanel({
  participants,
  faceIndex,
  seatOf,
  capacity,
  locked,
  pickedId,
  dragActive,
  dropOverUnseat,
  onPick,
  onDragStart,
  onLocate,
  onAutoAssign,
  onShuffle,
  onClear,
}: {
  participants: Participant[];
  faceIndex: Map<string, ParticipantFaceInfo>;
  seatOf: Map<string, { tableName: string; seatNumber: number }>;
  capacity: number;
  locked: boolean;
  pickedId: string | null;
  dragActive: boolean;
  dropOverUnseat: boolean;
  onPick: (participantId: string | null) => void;
  onDragStart: (e: React.PointerEvent, participantId: string) => void;
  onLocate: (participantId: string) => void;
  onAutoAssign: (strategy: AutoAssignStrategy) => void;
  onShuffle: () => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"unseated" | "all">("unseated");

  const seatedCount = participants.filter((p) => seatOf.has(p.id)).length;
  const unseatedCount = participants.length - seatedCount;

  const list = useMemo(() => {
    const q = fold(query);
    return participants
      .filter((p) => (tab === "unseated" ? !seatOf.has(p.id) : true))
      .filter(
        (p) =>
          !q ||
          fold(p.displayName).includes(q) ||
          fold(p.organization ?? "").includes(q) ||
          fold(p.jobTitle ?? "").includes(q)
      )
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "id"));
  }, [participants, seatOf, query, tab]);

  return (
    <div className="flex flex-col gap-space-md">
      <section className="rounded-2xl bg-surface-card border border-border-subtle p-space-md shadow-xs flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-label-lg text-label-lg text-on-surface">Keterisian</h3>
          <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-label-sm font-label-sm text-primary">
            {seatedCount}/{participants.length} duduk · {capacity} kursi
          </span>
        </div>
        <div className="h-2 rounded-full bg-surface-slate overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: participants.length ? `${(seatedCount / participants.length) * 100}%` : "0%" }}
          />
        </div>
        {capacity < participants.length && (
          <p className="text-body-sm text-[#b45309]">
            Kursi kurang {participants.length - capacity}. Tambah kursi/meja di mode <strong>Edit denah</strong>.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Menu
            width={280}
            trigger={({ toggle }) => (
              <Button variant="primary" size="sm" icon={Wand2} onClick={toggle} disabled={locked || unseatedCount === 0} className="w-full">
                Isi otomatis
              </Button>
            )}
            items={[
              {
                label: "Campur instansi",
                description: "Orang dari instansi yang sama disebar ke meja berbeda",
                icon: Sparkles,
                onSelect: () => onAutoAssign("mix-org"),
              },
              { label: "Acak", description: "Kursi kosong diisi secara acak", icon: Shuffle, onSelect: () => onAutoAssign("random") },
              { label: "Urut daftar", description: "Sesuai urutan daftar peserta", onSelect: () => onAutoAssign("order") },
            ]}
          />
          <Menu
            align="right"
            width={260}
            trigger={({ toggle }) => (
              <Button variant="secondary" size="sm" icon={Shuffle} onClick={toggle} disabled={locked || seatedCount === 0} className="w-full">
                Atur ulang
              </Button>
            )}
            items={[
              { label: "Acak / rotasi posisi duduk", description: "Semua yang sudah duduk ditukar acak", icon: Shuffle, onSelect: onShuffle },
              { label: "Kosongkan semua kursi", icon: Eraser, danger: true, onSelect: onClear },
            ]}
          />
        </div>
      </section>

      <section
        data-unseat-zone
        className={`rounded-2xl bg-surface-card border p-space-md shadow-xs flex flex-col gap-2 transition-colors ${
          dragActive ? (dropOverUnseat ? "border-primary-container bg-surface-container-low" : "border-dashed border-outline-variant") : "border-border-subtle"
        }`}
      >
        <div className="flex items-center gap-1 rounded-lg bg-surface-slate p-1 text-label-md font-label-md">
          {(
            [
              ["unseated", `Belum duduk (${unseatedCount})`],
              ["all", `Semua (${participants.length})`],
            ] as Array<["unseated" | "all", string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 rounded-md px-2 py-1.5 ${tab === key ? "bg-surface-card text-primary shadow-xs" : "text-on-surface-variant"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari peserta…"
            className="w-full h-9 pl-9 pr-3 bg-surface-slate border border-border-subtle rounded-lg text-body-md focus:bg-surface-card focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/30"
          />
        </div>
        {dragActive ? (
          <p className="rounded-lg bg-surface-slate px-3 py-2 text-body-sm text-on-surface-variant">
            Lepas di sini untuk mengosongkan kursi.
          </p>
        ) : (
          !locked &&
          tab === "unseated" &&
          unseatedCount > 0 && (
            <p className="text-body-sm text-on-surface-variant">
              Seret ke kursi, atau ketuk nama lalu ketuk kursi kosong.
            </p>
          )
        )}
        <ul className="flex flex-col gap-1 max-h-[46vh] overflow-y-auto -mx-1 px-1">
          {list.length === 0 && (
            <li className="py-4 text-center text-body-sm text-on-surface-variant">
              {participants.length === 0
                ? "Belum ada peserta di kelas ini."
                : tab === "unseated" && !query
                  ? "Semua peserta sudah duduk."
                  : "Tidak ada yang cocok."}
            </li>
          )}
          {list.map((p) => {
            const where = seatOf.get(p.id);
            const picked = pickedId === p.id;
            return (
              <li key={p.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onPointerDown={(e) => {
                    if (e.pointerType === "mouse" && !locked) onDragStart(e, p.id);
                  }}
                  onClick={() => (where && tab === "all" ? onLocate(p.id) : !locked && onPick(picked ? null : p.id))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (where && tab === "all") onLocate(p.id);
                      else if (!locked) onPick(picked ? null : p.id);
                    }
                  }}
                  className={`group flex items-center gap-2.5 rounded-xl border px-2 py-1.5 select-none transition-colors ${
                    picked
                      ? "border-primary-container bg-surface-container-low ring-2 ring-primary-container/25"
                      : "border-transparent hover:border-border-subtle hover:bg-surface-slate"
                  } ${locked ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}
                >
                  <Avatar src={faceIndex.get(p.id)?.faceUrl} name={p.displayName} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-label-lg font-label-lg text-on-surface truncate">{p.displayName}</span>
                    <span className="block text-body-sm text-on-surface-variant truncate">
                      {where ? `${where.tableName} · kursi ${where.seatNumber}` : p.organization ?? p.jobTitle ?? "Belum duduk"}
                    </span>
                  </span>
                  {where ? (
                    <LocateFixed size={16} className="text-outline group-hover:text-primary shrink-0" aria-label="Tunjukkan di denah" />
                  ) : (
                    !locked && (
                      <span
                        className="touch-none p-1 -mr-1 text-outline group-hover:text-on-surface shrink-0"
                        onPointerDown={(e) => {
                          if (e.pointerType !== "mouse") {
                            e.stopPropagation();
                            onDragStart(e, p.id);
                          }
                        }}
                        aria-hidden
                      >
                        <GripVertical size={18} />
                      </span>
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
