"use client";

/* eslint-disable @next/next/no-img-element -- local data URLs */
import { useMemo, useState } from "react";
import type { DetectedFace, FaceBox, Photo } from "@/domain/face";
import type { Participant } from "@/domain/participant";
import { shortName } from "@/features/seating/geometry";
import { useImageAsset } from "@/features/photos/useImageAsset";
import { useElementSize } from "@/ui/useElementSize";

export function PhotoFaceViewer({
  photo,
  faces,
  participantsById,
  targetFaceIds,
  onFaceClick,
  drawMode,
  onDraw,
  zoomFace,
  showIgnored,
  className = "",
}: {
  photo: Photo;
  faces: DetectedFace[];
  participantsById: Map<string, Participant>;
  targetFaceIds: Set<string>;
  onFaceClick: (face: DetectedFace) => void;
  drawMode: boolean;
  onDraw: (box: FaceBox) => void;
  zoomFace: DetectedFace | null;
  showIgnored: boolean;
  className?: string;
}) {
  const asset = useImageAsset(photo.imageAssetId);
  const [frameRef, frame] = useElementSize<HTMLDivElement>();
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [maxHeight] = useState(() =>
    typeof window === "undefined" ? 560 : Math.max(260, Math.min(560, window.innerHeight * (window.innerWidth < 640 ? 0.5 : 0.6)))
  );

  const natural = useMemo(() => (asset ? { w: asset.width, h: asset.height } : null), [asset]);
  // the frame is as tall as the photo needs (no letterbox bands), capped at maxHeight
  const frameHeight = natural && frame.width ? Math.min(maxHeight, (frame.width * natural.h) / natural.w) : maxHeight * 0.75;
  const fit = natural && frame.width ? Math.min(frame.width / natural.w, frameHeight / natural.h) : 0;
  const view = natural ? { w: natural.w * fit, h: natural.h * fit } : { w: 0, h: 0 };

  // zoom: centre the chosen face and scale so it fills ~35% of the view height
  const transform = useMemo(() => {
    if (!zoomFace || !natural || !fit) return { s: 1, tx: 0, ty: 0 };
    const s = Math.min(4, Math.max(1, (0.35 * natural.h) / Math.max(1, zoomFace.box.height)));
    if (s <= 1.05) return { s: 1, tx: 0, ty: 0 };
    const fx = (zoomFace.box.x + zoomFace.box.width / 2) * fit;
    const fy = (zoomFace.box.y + zoomFace.box.height / 2) * fit;
    const tx = Math.min(0, Math.max(view.w - view.w * s, view.w / 2 - fx * s));
    const ty = Math.min(0, Math.max(view.h - view.h * s, view.h / 2 - fy * s));
    return { s, tx, ty };
  }, [zoomFace, natural, fit, view.w, view.h]);

  function toNatural(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    return {
      x: Math.max(0, Math.min(natural!.w, (px - transform.tx) / transform.s / fit)),
      y: Math.max(0, Math.min(natural!.h, (py - transform.ty) / transform.s / fit)),
    };
  }

  function place(box: FaceBox) {
    const k = fit * transform.s;
    return {
      left: box.x * k + transform.tx,
      top: box.y * k + transform.ty,
      width: box.width * k,
      height: box.height * k,
    };
  }

  const visible = faces.filter((f) => showIgnored || (f.status !== "not_a_face" && f.status !== "rejected"));

  return (
    <div
      ref={frameRef}
      className={`relative w-full flex items-center justify-center overflow-hidden ${className}`}
      style={{ height: frameHeight }}
    >
      {asset === undefined && <div className="absolute inset-0 bg-surface-slate animate-pulse rounded-xl" />}
      {asset === null && <p className="text-body-sm text-on-surface-variant">Foto asli tidak tersedia.</p>}
      {asset && fit > 0 && (
        <div className="relative overflow-hidden rounded-xl bg-inverse-surface" style={{ width: view.w, height: view.h }}>
          <img
            src={asset.dataUrl}
            alt={photo.fileName ?? "Foto kelas"}
            draggable={false}
            className="absolute left-0 top-0 max-w-none select-none transition-transform duration-300 ease-out"
            style={{
              width: view.w,
              height: view.h,
              transformOrigin: "0 0",
              transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.s})`,
            }}
          />
          {!drawMode &&
            visible.map((face) => {
              const pos = place(face.box);
              const isTarget = targetFaceIds.has(face.id);
              const participant = face.participantId ? participantsById.get(face.participantId) : undefined;
              const ignored = face.status === "not_a_face" || face.status === "rejected";
              const assigned = face.status === "assigned" && participant;
              const border = isTarget
                ? "border-[3px] border-[#2563eb] shadow-[0_0_0_3px_rgba(255,255,255,0.85),0_0_18px_rgba(37,99,235,0.6)]"
                : assigned
                  ? "border-2 border-[#10b981] hover:border-[3px]"
                  : ignored
                    ? "border-2 border-dotted border-white/70"
                    : "border-2 border-dashed border-[#f59e0b] hover:border-solid";
              const label = isTarget ? (assigned ? shortName(participant!.displayName) : "Siapa ini?") : assigned ? shortName(participant!.displayName) : ignored ? "diabaikan" : "?";
              const chip = isTarget
                ? "bg-[#2563eb] text-white"
                : assigned
                  ? "bg-[#10b981] text-white"
                  : ignored
                    ? "bg-black/60 text-white/80"
                    : "bg-[#f59e0b] text-[#1f1300]";
              return (
                <button
                  key={face.id}
                  type="button"
                  onClick={() => onFaceClick(face)}
                  className={`absolute rounded-md transition-[left,top,width,height] duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${border} ${
                    isTarget ? "z-20" : "z-10"
                  }`}
                  style={pos}
                  title={assigned ? participant!.displayName : ignored ? "Ditandai bukan peserta" : "Belum dinamai — klik untuk memilih"}
                  aria-label={assigned ? `Wajah ${participant!.displayName}` : "Wajah belum dinamai"}
                >
                  {(pos.width > 22 || isTarget || assigned) && (
                    <span
                      className={`absolute whitespace-nowrap rounded px-1.5 py-px text-[11px] font-semibold leading-4 shadow ${chip} ${
                        pos.top < 20 ? "-bottom-1 translate-y-full" : "-top-1 -translate-y-full"
                      } ${
                        // keep the chip inside the photo near the left/right edges
                        pos.left < 36 ? "left-0" : pos.left + pos.width > view.w - 36 ? "right-0" : "left-1/2 -translate-x-1/2"
                      }`}
                    >
                      {label}
                    </span>
                  )}
                </button>
              );
            })}
          {drawMode && (
            <div
              className="absolute inset-0 z-30 cursor-crosshair touch-none bg-black/10"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                const p = toNatural(e);
                setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
              }}
              onPointerMove={(e) => {
                if (!draft) return;
                const p = toNatural(e);
                setDraft((d) => (d ? { ...d, x1: p.x, y1: p.y } : d));
              }}
              onPointerUp={() => {
                if (!draft) return;
                const box = {
                  x: Math.min(draft.x0, draft.x1),
                  y: Math.min(draft.y0, draft.y1),
                  width: Math.abs(draft.x1 - draft.x0),
                  height: Math.abs(draft.y1 - draft.y0),
                };
                setDraft(null);
                if (box.width >= 12 && box.height >= 12) onDraw(box);
              }}
            >
              {faces
                .filter((f) => f.status !== "not_a_face" && f.status !== "rejected")
                .map((f) => (
                  <span key={f.id} className="absolute rounded-md border border-white/60" style={place(f.box)} />
                ))}
              {draft && (
                <span
                  className="absolute rounded-md border-[3px] border-[#2563eb] bg-[#2563eb]/15"
                  style={place({
                    x: Math.min(draft.x0, draft.x1),
                    y: Math.min(draft.y0, draft.y1),
                    width: Math.abs(draft.x1 - draft.x0),
                    height: Math.abs(draft.y1 - draft.y0),
                  })}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
