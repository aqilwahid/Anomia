"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, Eye, Mail, MessageCircle, Pencil, Phone, Search, UserMinus, X } from "lucide-react";
import type { Participant } from "@/domain/participant";
import type { ParticipantFaceInfo } from "@/features/classes/useClassData";
import { Avatar } from "@/ui/Avatar";
import { Button } from "@/ui/Button";

export interface SeatContext {
  key: string;
  tableName: string;
  seatNumber: number;
}

function fold(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function waLink(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  return `https://wa.me/${digits}`;
}

/** Floating card next to a chair: participant details, or a picker for an empty chair. */
export function SeatPopover({
  anchor,
  seat,
  occupant,
  faceIndex,
  participants,
  seatOf,
  locked,
  nameHidden,
  onClose,
  onPlace,
  onUnseat,
  onMove,
  onEdit,
  onReveal,
}: {
  /** anchor rect in viewport coordinates */
  anchor: DOMRect;
  seat: SeatContext;
  occupant: Participant | null;
  faceIndex: Map<string, ParticipantFaceInfo>;
  participants: Participant[];
  seatOf: Map<string, { tableName: string; seatNumber: number }>;
  locked: boolean;
  nameHidden: boolean;
  onClose: () => void;
  onPlace: (participantId: string) => void;
  onUnseat: (participantId: string) => void;
  onMove: (participantId: string) => void;
  onEdit: (participant: Participant) => void;
  onReveal: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; sheet: boolean }>({ left: -9999, top: -9999, sheet: false });
  const [query, setQuery] = useState("");
  const [showSeated, setShowSeated] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw < 640) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- positioning needs the measured DOM size
      setPos({ left: 0, top: 0, sheet: true });
      return;
    }
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const gap = 12;
    let left = anchor.right + gap;
    if (left + w > vw - 8) left = anchor.left - gap - w;
    if (left < 8) left = Math.min(vw - w - 8, Math.max(8, anchor.left + anchor.width / 2 - w / 2));
    let top = anchor.top + anchor.height / 2 - h / 2;
    top = Math.max(8, Math.min(vh - h - 8, top));
    setPos({ left, top, sheet: false });
  }, [anchor, occupant, showSeated, query]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (ref.current?.contains(target as Node)) return;
      // clicks on another chair are handled by the plan itself
      if (target?.closest?.("[data-seat]")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const candidates = useMemo(() => {
    const q = fold(query);
    return participants
      .filter((p) => showSeated || !seatOf.has(p.id))
      .filter((p) => !q || fold(p.displayName).includes(q) || fold(p.organization ?? "").includes(q))
      .sort((a, b) => Number(seatOf.has(a.id)) - Number(seatOf.has(b.id)) || a.displayName.localeCompare(b.displayName, "id"))
      .slice(0, 60);
  }, [participants, seatOf, query, showSeated]);

  const info = occupant ? faceIndex.get(occupant.id) : undefined;

  return (
    <>
      {pos.sheet && <div className="fixed inset-0 z-[60] bg-on-surface/30 no-print" onClick={onClose} />}
      <div
        ref={ref}
        role="dialog"
        aria-label={occupant ? `Detail ${occupant.displayName}` : `Kursi kosong ${seat.tableName}`}
        className={`fixed z-[61] bg-surface-card border border-border-subtle shadow-2xl no-print animate-pop-in ${
          pos.sheet ? "inset-x-0 bottom-0 rounded-t-2xl max-h-[80vh] overflow-y-auto" : "w-[320px] rounded-2xl"
        }`}
        style={pos.sheet ? undefined : { left: pos.left, top: pos.top }}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <span className="text-label-md font-label-md text-on-surface-variant">
            {seat.tableName} · Kursi {seat.seatNumber}
          </span>
          <button type="button" onClick={onClose} className="p-1 rounded-md text-outline hover:text-on-surface hover:bg-surface-slate" aria-label="Tutup">
            <X size={16} />
          </button>
        </div>

        {occupant ? (
          <div className="p-4 pt-2 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar src={info?.faceUrl} name={occupant.displayName} size={76} shape="rounded" />
              <div className="min-w-0">
                {nameHidden ? (
                  <button type="button" onClick={onReveal} className="inline-flex items-center gap-1.5 text-label-lg font-label-lg text-primary">
                    <Eye size={16} aria-hidden /> Tampilkan nama
                  </button>
                ) : (
                  <>
                    <div className="font-headline-sm text-headline-sm text-on-surface leading-tight">{occupant.displayName}</div>
                    {(occupant.jobTitle || occupant.organization) && (
                      <div className="mt-0.5 text-body-md text-on-surface-variant">
                        {[occupant.jobTitle, occupant.organization].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </>
                )}
                <div className="mt-1 text-body-sm text-outline">
                  {info?.faceCount ? `${info.faceCount} foto wajah` : "Belum ada foto wajah"}
                </div>
              </div>
            </div>

            {!nameHidden && (occupant.email || occupant.phone || occupant.notes) && (
              <div className="flex flex-col gap-1.5 rounded-xl bg-surface-slate p-3 text-body-sm">
                {occupant.email && (
                  <a href={`mailto:${occupant.email}`} className="flex items-center gap-2 text-on-surface hover:text-primary truncate">
                    <Mail size={14} className="text-outline shrink-0" aria-hidden /> {occupant.email}
                  </a>
                )}
                {occupant.phone && (
                  <span className="flex items-center gap-2 text-on-surface">
                    <Phone size={14} className="text-outline shrink-0" aria-hidden />
                    <a href={`tel:${occupant.phone}`} className="hover:text-primary">
                      {occupant.phone}
                    </a>
                    <a href={waLink(occupant.phone)} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[#15803d] hover:underline">
                      <MessageCircle size={13} aria-hidden /> WA
                    </a>
                  </span>
                )}
                {occupant.notes && <p className="text-on-surface-variant whitespace-pre-line">{occupant.notes}</p>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" icon={ArrowRightLeft} onClick={() => onMove(occupant.id)} disabled={locked}>
                Pindahkan
              </Button>
              <Button variant="secondary" size="sm" icon={UserMinus} onClick={() => onUnseat(occupant.id)} disabled={locked}>
                Kosongkan
              </Button>
              <Button variant="soft" size="sm" icon={Pencil} onClick={() => onEdit(occupant)} className="col-span-2">
                Lihat / ubah data peserta
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-4 pt-2 flex flex-col gap-2">
            {locked ? (
              <p className="text-body-sm text-on-surface-variant">Kursi kosong. Buka kunci denah untuk menempatkan peserta.</p>
            ) : (
              <>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" aria-hidden />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && candidates[0]) onPlace(candidates[0].id);
                    }}
                    placeholder="Siapa yang duduk di sini?"
                    className="w-full h-10 pl-9 pr-3 bg-surface-slate border border-border-subtle rounded-lg text-body-md focus:bg-surface-card focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/30"
                  />
                </div>
                <label className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                  <input type="checkbox" checked={showSeated} onChange={(e) => setShowSeated(e.target.checked)} className="accent-primary" />
                  Tampilkan juga yang sudah duduk (akan dipindah)
                </label>
                <ul className="max-h-64 overflow-y-auto -mx-1 px-1">
                  {candidates.length === 0 && (
                    <li className="py-3 text-center text-body-sm text-on-surface-variant">
                      {participants.length === 0 ? "Belum ada peserta." : "Semua peserta sudah duduk."}
                    </li>
                  )}
                  {candidates.map((p) => {
                    const where = seatOf.get(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => onPlace(p.id)}
                          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-slate text-left"
                        >
                          <Avatar src={faceIndex.get(p.id)?.faceUrl} name={p.displayName} size={32} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-label-lg font-label-lg text-on-surface truncate">{p.displayName}</span>
                            <span className="block text-body-sm text-on-surface-variant truncate">
                              {where ? `Sekarang di ${where.tableName} · ${where.seatNumber}` : p.organization ?? "Belum duduk"}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
