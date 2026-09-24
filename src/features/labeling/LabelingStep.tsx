"use client";

/* eslint-disable @next/next/no-img-element -- face crops are local data URLs */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Eye,
  EyeOff,
  ImageOff,
  Keyboard,
  Loader2,
  RotateCcw,
  ScanSearch,
  Sparkles,
  Star,
  Trash2,
  Undo2,
  UserMinus,
  UserX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { DetectedFace, FaceBox } from "@/domain/face";
import type { Participant } from "@/domain/participant";
import { localStore } from "@/store/localStore";
import { notifyDataChanged } from "@/store/events";
import { centroid, clusterFaces, SUGGEST_MIN, SUGGEST_STRONG } from "@/face/cluster";
import { cosineSimilarity } from "@/face/pipeline";
import { Button } from "@/ui/Button";
import { Avatar } from "@/ui/Avatar";
import { useConfirm, useToast } from "@/ui/Providers";
import { useClassData } from "@/features/classes/useClassData";
import { StepFooterNav } from "@/features/classes/StepFooterNav";
import { PhotoThumb } from "@/features/photos/PhotoThumb";
import { addManualFace, rescanPhoto } from "@/features/photos/faceOps";
import { NameCombobox, type ComboPick, type NameComboboxHandle } from "./NameCombobox";
import { PhotoFaceViewer } from "./PhotoFaceViewer";

type Tab = "todo" | "done" | "ignored";
type Selection = { type: "cluster"; anchorFaceId: string } | { type: "face"; faceId: string };

interface FaceCluster {
  id: string;
  faces: DetectedFace[];
}

interface UndoEntry {
  id: number;
  label: string;
  undo: () => Promise<void>;
}

const isIgnored = (f: DetectedFace) => f.status === "not_a_face" || f.status === "rejected";

function fold(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function qualityLabel(q: number) {
  if (q >= 0.7) return { text: "Jelas", cls: "bg-confidence-high/15 text-[#047857]" };
  if (q >= 0.45) return { text: "Cukup", cls: "bg-confidence-medium/15 text-[#b45309]" };
  return { text: "Kecil / buram", cls: "bg-confidence-low/15 text-[#b91c1c]" };
}

export function LabelingStep({ classGroupId }: { classGroupId: string }) {
  const { participants, photos, faces, embeddings, faceIndex, loading, reload } = useClassData(classGroupId);
  const toast = useToast();
  const confirm = useConfirm();

  const [tab, setTab] = useState<Tab>("todo");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [preferredIndex, setPreferredIndex] = useState(0);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [nameInput, setNameInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [zoom, setZoom] = useState(true);
  const [showIgnored, setShowIgnored] = useState(false);
  // `?photo=<id>` (from the photo grid) opens that photo first
  const [initialPhotoId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("photo")
  );
  const [viewPhotoId, setViewPhotoId] = useState<string | null>(initialPhotoId);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const comboRef = useRef<NameComboboxHandle>(null);

  /* ------------------------------------------------------------ indexes */

  const participantsById = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);
  const faceById = useMemo(() => new Map(faces.map((f) => [f.id, f])), [faces]);
  const photoById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const photoOrder = useMemo(() => new Map(photos.map((p, i) => [p.id, i])), [photos]);
  const embeddingByFace = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const e of embeddings) map.set(e.detectedFaceId, e.vector);
    return map;
  }, [embeddings]);
  const facesByPhoto = useMemo(() => {
    const map = new Map<string, DetectedFace[]>();
    for (const f of faces) {
      const list = map.get(f.photoId) ?? [];
      list.push(f);
      map.set(f.photoId, list);
    }
    return map;
  }, [faces]);

  const queue = useMemo<FaceCluster[]>(() => {
    const unlabeled = faces.filter((f) => f.status === "unlabeled");
    const idx = clusterFaces(
      unlabeled.map((f) => ({ id: f.id, photoId: f.photoId, vector: embeddingByFace.get(f.id) ?? null }))
    );
    const groups = new Map<number, DetectedFace[]>();
    unlabeled.forEach((f, i) => {
      const list = groups.get(idx[i]) ?? [];
      list.push(f);
      groups.set(idx[i], list);
    });
    const clusters = Array.from(groups.values()).map((list) => {
      const sorted = [...list].sort((a, b) => b.qualityScore - a.qualityScore);
      return { id: sorted[0].id, faces: sorted };
    });
    const pos = (f: DetectedFace) => [photoOrder.get(f.photoId) ?? 0, Math.round(f.box.y / Math.max(40, f.box.height)), f.box.x];
    return clusters.sort((a, b) => {
      if (b.faces.length !== a.faces.length) return b.faces.length - a.faces.length;
      const pa = pos(a.faces[0]);
      const pb = pos(b.faces[0]);
      return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
    });
  }, [faces, embeddingByFace, photoOrder]);

  const clusterIndexOfFace = useMemo(() => {
    const map = new Map<string, number>();
    queue.forEach((c, i) => c.faces.forEach((f) => map.set(f.id, i)));
    return map;
  }, [queue]);

  /* ---------------------------------------------------------- selection */

  const effective: Selection | null = useMemo(() => {
    if (selection?.type === "cluster" && clusterIndexOfFace.has(selection.anchorFaceId)) return selection;
    if (selection?.type === "face" && faceById.has(selection.faceId)) return selection;
    if (!selection && initialPhotoId) {
      const inPhoto = queue.find((c) => c.faces.some((f) => f.photoId === initialPhotoId));
      if (inPhoto) return { type: "cluster", anchorFaceId: inPhoto.id };
    }
    if (queue.length) return { type: "cluster", anchorFaceId: queue[Math.min(preferredIndex, queue.length - 1)].id };
    return null;
  }, [selection, clusterIndexOfFace, faceById, queue, preferredIndex, initialPhotoId]);

  const activeIndex = effective?.type === "cluster" ? (clusterIndexOfFace.get(effective.anchorFaceId) ?? -1) : -1;
  const activeCluster = activeIndex >= 0 ? queue[activeIndex] : null;
  const activeFace = effective?.type === "face" ? (faceById.get(effective.faceId) ?? null) : null;
  const selectionKey = effective ? (effective.type === "cluster" ? `c:${activeCluster?.id}` : `f:${effective.faceId}`) : "none";

  const targetFaces = useMemo(
    () => (activeCluster ? activeCluster.faces.filter((f) => !excluded.has(f.id)) : activeFace ? [activeFace] : []),
    [activeCluster, activeFace, excluded]
  );
  const leadFace = activeCluster?.faces[0] ?? activeFace ?? null;

  const viewPhoto = (viewPhotoId && photoById.get(viewPhotoId)) || (leadFace ? photoById.get(leadFace.photoId) : undefined) || photos[0];
  const viewFaces = viewPhoto ? (facesByPhoto.get(viewPhoto.id) ?? []) : [];
  const targetIds = useMemo(() => new Set(targetFaces.map((f) => f.id)), [targetFaces]);
  const zoomFace = zoom ? (targetFaces.find((f) => f.photoId === viewPhoto?.id) ?? null) : null;

  /**
   * Change the selection. `photo`: "follow" (default) shows the photo of the new
   * target, "keep" leaves the viewer where it is, or an explicit photo id.
   */
  function select(next: Selection | null, opts: { photo?: "follow" | "keep" | string } = {}) {
    setSelection(next);
    setExcluded(new Set());
    setNameInput("");
    setDrawMode(false);
    const photo = opts.photo ?? "follow";
    if (photo === "follow") setViewPhotoId(null);
    else if (photo !== "keep") setViewPhotoId(photo);
  }

  function openPhoto(photoId: string) {
    const i = queue.findIndex((c) => c.faces.some((f) => f.photoId === photoId));
    if (i >= 0) {
      setPreferredIndex(i);
      select({ type: "cluster", anchorFaceId: queue[i].id }, { photo: photoId });
      return;
    }
    const first = (facesByPhoto.get(photoId) ?? []).find((f) => !isIgnored(f));
    select(first ? { type: "face", faceId: first.id } : null, { photo: photoId });
  }

  function goToCluster(index: number) {
    if (queue.length === 0) return;
    const i = (index + queue.length) % queue.length;
    setPreferredIndex(i);
    select({ type: "cluster", anchorFaceId: queue[i].id });
    setTab("todo");
  }

  function selectFace(face: DetectedFace, opts: { photo?: "follow" | "keep" | string } = {}) {
    if (face.status === "unlabeled") {
      const i = clusterIndexOfFace.get(face.id);
      if (i !== undefined) {
        setPreferredIndex(i);
        select({ type: "cluster", anchorFaceId: queue[i].id }, opts);
        return;
      }
    }
    select({ type: "face", faceId: face.id }, opts);
  }

  // keep the name box focused on desktops so the instructor can just type → Enter → type …
  useEffect(() => {
    if (effective?.type !== "cluster") return;
    if (typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches) {
      comboRef.current?.focus();
    }
  }, [selectionKey, effective?.type]);

  /* -------------------------------------------------------- suggestions */

  const participantVectors = useMemo(() => {
    const byP = new Map<string, number[][]>();
    for (const f of faces) {
      if (f.status !== "assigned" || !f.participantId) continue;
      const v = embeddingByFace.get(f.id);
      if (!v) continue;
      const list = byP.get(f.participantId) ?? [];
      list.push(v);
      byP.set(f.participantId, list);
    }
    const out = new Map<string, number[]>();
    for (const [pid, vs] of byP) out.set(pid, centroid(vs)!);
    return out;
  }, [faces, embeddingByFace]);

  // a person cannot appear twice in one photo → block names already used in the target's photos
  const blocked = useMemo(() => {
    const map = new Map<string, string>();
    const targetPhotoIds = new Set(targetFaces.map((f) => f.photoId));
    for (const f of faces) {
      if (f.status !== "assigned" || !f.participantId || targetIds.has(f.id)) continue;
      if (targetPhotoIds.has(f.photoId)) map.set(f.participantId, "Sudah dinamai di foto yang sama");
    }
    return map;
  }, [faces, targetFaces, targetIds]);

  const currentParticipantId = activeFace?.status === "assigned" ? activeFace.participantId : null;

  const suggestions = useMemo(() => {
    const vectors = targetFaces.map((f) => embeddingByFace.get(f.id)).filter((v): v is number[] => !!v);
    const target = centroid(vectors);
    if (!target) return [];
    // editing an already-named face: only flag people who look MORE alike than the current name
    // (a hint that the label may be wrong), computed without this face itself
    let floor = SUGGEST_MIN;
    if (currentParticipantId) {
      const others = faces
        .filter((f) => f.participantId === currentParticipantId && f.status === "assigned" && !targetIds.has(f.id))
        .map((f) => embeddingByFace.get(f.id))
        .filter((v): v is number[] => !!v);
      const own = centroid(others);
      if (own) floor = Math.max(floor, cosineSimilarity(target, own) + 0.03);
    }
    const out: Array<{ participant: Participant; similarity: number }> = [];
    for (const [pid, vec] of participantVectors) {
      if (pid === currentParticipantId || blocked.has(pid)) continue;
      const participant = participantsById.get(pid);
      if (!participant) continue;
      const similarity = cosineSimilarity(target, vec);
      if (similarity >= floor) out.push({ participant, similarity });
    }
    return out.sort((a, b) => b.similarity - a.similarity).slice(0, 3);
  }, [targetFaces, targetIds, faces, embeddingByFace, participantVectors, participantsById, blocked, currentParticipantId]);

  /* ------------------------------------------------------------ actions */

  const undoSeq = useRef(0);
  const pushUndo = useCallback((entry: Omit<UndoEntry, "id">) => {
    const id = ++undoSeq.current;
    setUndoStack((s) => [...s.slice(-29), { ...entry, id }]);
    return id;
  }, []);

  /** Undo the latest action. From a toast (`onlyId`), only if that toast's action is still the latest. */
  const undo = useCallback(async (onlyId?: number) => {
    const entry = undoStack[undoStack.length - 1];
    if (!entry || busy) return;
    if (onlyId !== undefined && entry.id !== onlyId) {
      toast.show({ message: "Sudah ada perubahan yang lebih baru — pakai tombol Urungkan di atas untuk mundur satu per satu." });
      return;
    }
    setBusy(true);
    try {
      await entry.undo();
      setUndoStack((s) => s.slice(0, -1));
      await reload();
      notifyDataChanged();
      toast.show({ message: `Dibatalkan: ${entry.label}` });
    } finally {
      setBusy(false);
    }
  }, [undoStack, busy, reload, toast]);

  async function withBusy<T>(fn: () => Promise<T>) {
    if (busy) return;
    setBusy(true);
    try {
      return await fn();
    } catch (err) {
      console.error(err);
      toast.show({ message: err instanceof Error ? err.message : "Terjadi kesalahan", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  /**
   * After naming/ignoring the active cluster: stay on the same photo while it
   * still has unnamed faces (natural left-to-right flow through a group photo),
   * otherwise continue with the next cluster in the queue.
   */
  function afterClusterDone() {
    if (!activeCluster) return;
    const others = queue.filter((c) => c.id !== activeCluster.id);
    const nextIndex = Math.max(0, Math.min(activeIndex, others.length - 1));
    setPreferredIndex(nextIndex);
    if (others.length === 0) {
      select(null, { photo: "keep" });
      return;
    }
    const photoId = viewPhoto?.id;
    const samePhoto = photoId ? others.find((c) => c.faces.some((f) => f.photoId === photoId)) : undefined;
    if (samePhoto && photoId) select({ type: "cluster", anchorFaceId: samePhoto.id }, { photo: photoId });
    else select({ type: "cluster", anchorFaceId: others[nextIndex].id });
  }

  async function assign(pick: ComboPick) {
    const target = targetFaces;
    if (target.length === 0) return;
    await withBusy(async () => {
      const prev = target.map((f) => ({ id: f.id, status: f.status, participantId: f.participantId }));
      let participant: Participant;
      let created = false;
      if (pick.kind === "new") {
        const existing = participants.find((p) => fold(p.displayName) === fold(pick.name));
        if (existing) participant = existing;
        else {
          participant = await localStore.createParticipant(classGroupId, { displayName: pick.name });
          created = true;
        }
      } else {
        participant = pick.participant;
      }
      if (blocked.has(participant.id)) {
        toast.show({ message: `${participant.displayName} sudah dinamai di foto yang sama.`, tone: "error" });
        return;
      }
      await localStore.assignFacesToParticipant(
        target.map((f) => f.id),
        participant.id
      );
      const label = `${target.length > 1 ? `${target.length} wajah` : "Wajah"} → ${participant.displayName}`;
      const undoId = pushUndo({
        label,
        undo: async () => {
          await localStore.setFaceStates(prev);
          if (created) await localStore.deleteParticipant(participant.id);
        },
      });
      if (activeCluster) afterClusterDone();
      else setNameInput("");
      await reload();
      notifyDataChanged();
      toast.show({ message: label, tone: "success", action: undoAction(undoId) });
    });
  }

  async function ignoreTarget() {
    const target = targetFaces;
    if (target.length === 0) return;
    await withBusy(async () => {
      const prev = target.map((f) => ({ id: f.id, status: f.status, participantId: f.participantId }));
      await localStore.rejectFaces(target.map((f) => f.id));
      const label = `${target.length > 1 ? `${target.length} wajah` : "Wajah"} ditandai bukan peserta`;
      const undoId = pushUndo({ label, undo: () => localStore.setFaceStates(prev) });
      if (activeCluster) afterClusterDone();
      await reload();
      notifyDataChanged();
      toast.show({ message: label, action: undoAction(undoId) });
    });
  }

  async function resetFace(face: DetectedFace) {
    await withBusy(async () => {
      const prev = [{ id: face.id, status: face.status, participantId: face.participantId }];
      await localStore.resetFaces([face.id]);
      const label = isIgnored(face) ? "Wajah dipulihkan ke antrean" : "Label wajah dilepas";
      const undoId = pushUndo({ label, undo: () => localStore.setFaceStates(prev) });
      await reload();
      notifyDataChanged();
      select({ type: "cluster", anchorFaceId: face.id }, { photo: "keep" });
      toast.show({ message: label, action: undoAction(undoId) });
    });
  }

  async function setPrimary(face: DetectedFace) {
    if (!face.participantId) return;
    const participant = participantsById.get(face.participantId);
    await withBusy(async () => {
      const before = participant?.primaryFaceId ?? null;
      await localStore.updateParticipant(face.participantId!, { primaryFaceId: face.id });
      pushUndo({
        label: "Foto profil diganti",
        undo: () => localStore.updateParticipant(face.participantId!, { primaryFaceId: before }),
      });
      await reload();
      toast.show({ message: `Foto profil ${participant?.displayName ?? ""} diganti`, tone: "success" });
    });
  }

  async function deleteManual(face: DetectedFace) {
    const ok = await confirm({
      title: "Hapus kotak wajah ini?",
      message: "Kotak wajah yang ditandai manual akan dihapus dari foto.",
      confirmLabel: "Hapus",
      tone: "danger",
    });
    if (!ok) return;
    await withBusy(async () => {
      await localStore.deleteFaces([face.id]);
      await reload();
      notifyDataChanged();
      select(null, { photo: "keep" });
    });
  }

  async function handleDraw(box: FaceBox) {
    if (!viewPhoto) return;
    setDrawMode(false);
    await withBusy(async () => {
      setScanStatus("Menganalisis wajah yang ditandai…");
      try {
        const { face, hasDescriptor } = await addManualFace(viewPhoto.id, box);
        pushUndo({ label: "Wajah manual ditambahkan", undo: () => localStore.deleteFaces([face.id]) });
        await reload();
        notifyDataChanged();
        select({ type: "cluster", anchorFaceId: face.id }, { photo: viewPhoto.id });
        toast.show({
          message: hasDescriptor
            ? "Wajah ditambahkan — silakan beri nama"
            : "Wajah ditambahkan (terlalu kecil/buram untuk dicocokkan otomatis, tapi tetap bisa dinamai)",
          tone: "success",
        });
      } finally {
        setScanStatus(null);
      }
    });
  }

  async function handleRescan() {
    if (!viewPhoto) return;
    const photoId = viewPhoto.id;
    await withBusy(async () => {
      setScanStatus("Memuat model deteksi…");
      try {
        const added = await rescanPhoto(photoId, faces, (p) =>
          setScanStatus(
            p.phase === "scan"
              ? `Memindai ulang foto… ${Math.round((p.done / Math.max(1, p.total)) * 100)}%`
              : `Memeriksa kandidat wajah ${p.done}/${p.total}…`
          )
        );
        if (added.length) {
          pushUndo({ label: `${added.length} wajah hasil pindai ulang`, undo: () => localStore.deleteFaces(added.map((f) => f.id)) });
        }
        await reload();
        notifyDataChanged();
        toast.show({
          message: added.length
            ? `${added.length} wajah baru ditemukan di foto ini`
            : "Tidak ada wajah baru. Kalau masih ada yang terlewat, tandai manual.",
          tone: added.length ? "success" : "default",
          action: added.length ? undefined : { label: "Tandai manual", onClick: () => setDrawMode(true) },
        });
      } finally {
        setScanStatus(null);
      }
    });
  }

  // stable handles for toast actions & the global key handler
  const undoRef = useRef(undo);
  const undoAction = (id: number) => ({ label: "Urungkan", onClick: () => undoRef.current(id) });
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    undoRef.current = undo;
    keyHandlerRef.current = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el?.closest("input, textarea, select, [contenteditable='true']");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey && !typing) {
        e.preventDefault();
        undo();
        return;
      }
      if (typing || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "Escape" && drawMode) {
        setDrawMode(false);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToCluster((activeIndex < 0 ? -1 : activeIndex) + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToCluster((activeIndex < 0 ? 0 : activeIndex) - 1);
      } else if (e.key === "/" || e.key.toLowerCase() === "n") {
        e.preventDefault();
        comboRef.current?.focus();
      }
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* -------------------------------------------------------------- stats */

  const activeFaces = faces.filter((f) => !isIgnored(f));
  const assignedCount = activeFaces.filter((f) => f.status === "assigned").length;
  const totalCount = activeFaces.length;
  const ignoredFaces = faces.filter(isIgnored);
  const participantsWithFaces = participants.filter((p) => (faceIndex.get(p.id)?.faceCount ?? 0) > 0);
  const participantsWithoutFaces = participants.filter((p) => (faceIndex.get(p.id)?.faceCount ?? 0) === 0);
  const unlabeledByPhoto = (photoId: string) =>
    (facesByPhoto.get(photoId) ?? []).filter((f) => f.status === "unlabeled").length;

  /* ------------------------------------------------------------- render */

  if (!loading && photos.length === 0) {
    return (
      <div className="w-full max-w-3xl mx-auto px-layout-gutter-mobile md:px-layout-gutter-desktop py-space-2xl">
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-card p-space-xl text-center">
          <ImageOff size={32} className="mx-auto text-outline" aria-hidden />
          <h1 className="mt-3 font-headline-sm text-headline-sm text-on-surface">Belum ada foto</h1>
          <p className="mt-1 text-body-md text-on-surface-variant">
            Unggah foto kelas atau foto peserta dulu, lalu kembali ke sini untuk memasangkan nama.
          </p>
          <Link
            href={`/classes/${classGroupId}/participants`}
            className="mt-5 inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container"
          >
            Ke Peserta &amp; Foto <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </div>
    );
  }

  const leadParticipant = activeFace?.participantId ? participantsById.get(activeFace.participantId) : undefined;
  const lastUndo = undoStack[undoStack.length - 1];

  return (
    <div className="w-full max-w-[1400px] mx-auto px-layout-gutter-mobile md:px-layout-gutter-desktop py-space-md">
      {/* header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-sm mb-space-md">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface">Pasangkan Nama ke Wajah</h1>
          <p className="text-body-md text-on-surface-variant">
            Pilih nama untuk tiap wajah. Wajah yang mirip sudah dikelompokkan — sekali pilih, semua ikut dinamai.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-label-lg text-label-lg text-on-surface">
              {assignedCount}/{totalCount} wajah dinamai
            </div>
            <div className="text-body-sm text-on-surface-variant">
              {participantsWithFaces.length}/{participants.length} peserta punya wajah
            </div>
          </div>
          <div className="w-28 h-2 rounded-full bg-surface-container-high overflow-hidden" aria-hidden>
            <div
              className="h-full rounded-full bg-primary-container transition-all"
              style={{ width: totalCount ? `${(assignedCount / totalCount) * 100}%` : "0%" }}
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={Undo2}
            disabled={!lastUndo || busy}
            onClick={() => undo()}
            title={lastUndo ? `Urungkan: ${lastUndo.label} (Ctrl+Z)` : "Belum ada yang bisa diurungkan"}
          >
            Urungkan
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md items-start">
        {/* photo viewer */}
        <section className="min-w-0 lg:col-span-8 flex flex-col gap-space-sm">
          <div className="rounded-2xl bg-surface-card border border-border-subtle shadow-xs overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-border-subtle">
              <div className="min-w-0 text-body-sm text-on-surface-variant truncate">
                {viewPhoto ? (
                  <>
                    <span className="font-label-md text-label-md text-on-surface">{viewPhoto.fileName ?? "Foto"}</span>
                    {" · "}
                    {viewFaces.filter((f) => !isIgnored(f)).length} wajah
                    {unlabeledByPhoto(viewPhoto.id) > 0 && ` · ${unlabeledByPhoto(viewPhoto.id)} belum dinamai`}
                  </>
                ) : (
                  "Memuat…"
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={zoom ? ZoomOut : ZoomIn}
                  onClick={() => setZoom((z) => !z)}
                  title={zoom ? "Tampilkan foto utuh" : "Perbesar ke wajah terpilih"}
                >
                  {zoom ? "Foto utuh" : "Perbesar"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={showIgnored ? EyeOff : Eye}
                  onClick={() => setShowIgnored((v) => !v)}
                  title="Tampilkan/sembunyikan kotak yang diabaikan"
                >
                  <span className="hidden sm:inline">{showIgnored ? "Sembunyikan diabaikan" : "Lihat diabaikan"}</span>
                </Button>
                <Button
                  variant={drawMode ? "primary" : "ghost"}
                  size="sm"
                  icon={Crosshair}
                  onClick={() => setDrawMode((d) => !d)}
                  disabled={busy || !viewPhoto}
                  title="Wajah tidak terdeteksi? Gambar kotak di sekitar wajahnya"
                >
                  {drawMode ? "Batal tandai" : "Tandai wajah"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={ScanSearch}
                  onClick={handleRescan}
                  disabled={busy || !viewPhoto}
                  title="Pindai ulang foto ini lebih teliti untuk mencari wajah yang terlewat"
                >
                  <span className="hidden sm:inline">Pindai ulang</span>
                </Button>
              </div>
            </div>
            <div className="relative bg-surface-slate p-2">
              {viewPhoto && (
                <PhotoFaceViewer
                  photo={viewPhoto}
                  faces={viewFaces}
                  participantsById={participantsById}
                  targetFaceIds={targetIds}
                  onFaceClick={(f) => selectFace(f, { photo: "keep" })}
                  drawMode={drawMode}
                  onDraw={handleDraw}
                  zoomFace={zoomFace}
                  showIgnored={showIgnored}
                />
              )}
              {drawMode && (
                <div className="absolute left-1/2 top-4 -translate-x-1/2 z-40 rounded-full bg-inverse-surface text-inverse-on-surface px-3 py-1.5 text-body-sm shadow-lg">
                  Seret kotak di sekitar wajah yang terlewat · Esc untuk batal
                </div>
              )}
              {scanStatus && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-surface-card/70 backdrop-blur-[1px]">
                  <div className="flex items-center gap-2 rounded-xl bg-surface-card px-4 py-3 shadow-lg text-body-md">
                    <Loader2 size={18} className="animate-spin text-primary" aria-hidden />
                    {scanStatus}
                  </div>
                </div>
              )}
            </div>
            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto scroll-thin px-3 py-2 border-t border-border-subtle">
                {photos.map((p) => {
                  const pending = unlabeledByPhoto(p.id);
                  const active = viewPhoto?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => openPhoto(p.id)}
                      className={`relative shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 ${
                        active ? "border-primary-container" : "border-transparent opacity-80 hover:opacity-100"
                      }`}
                      title={p.fileName ?? "Foto"}
                    >
                      <PhotoThumb photo={p} className="w-full h-full" />
                      <span
                        className={`absolute bottom-0.5 right-0.5 rounded px-1 text-[10px] font-bold leading-4 ${
                          pending ? "bg-[#f59e0b] text-[#1f1300]" : "bg-[#10b981] text-white"
                        }`}
                      >
                        {pending ? `${pending} ?` : <Check size={10} strokeWidth={3} aria-label="selesai" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-body-sm text-on-surface-variant">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm border-[3px] border-[#2563eb]" /> Sedang dipilih
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm border-2 border-dashed border-[#f59e0b]" /> Belum dinamai
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm border-2 border-[#10b981]" /> Sudah dinamai (klik untuk mengubah)
            </span>
            <span className="inline-flex items-center gap-1.5 ml-auto">
              <Keyboard size={14} aria-hidden /> Enter simpan · ←/→ pindah wajah · Ctrl+Z urungkan
            </span>
          </div>
        </section>

        {/* target panel */}
        <aside className="min-w-0 lg:col-span-4 lg:sticky lg:top-20">
          <div className="rounded-2xl bg-surface-card border border-border-subtle shadow-xs p-space-md flex flex-col gap-space-md">
            {!effective && !loading && (
              <div className="py-6 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-confidence-high/15 text-confidence-high">
                  <Check size={24} strokeWidth={3} aria-hidden />
                </span>
                <h2 className="mt-3 font-headline-sm text-headline-sm text-on-surface">Semua wajah sudah dinamai</h2>
                <p className="mt-1 text-body-sm text-on-surface-variant">
                  Klik kotak hijau di foto untuk mengubah label, atau tandai wajah yang terlewat.
                </p>
                <Link
                  href={`/classes/${classGroupId}/seating`}
                  className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container"
                >
                  Lanjut ke Denah <ArrowRight size={16} aria-hidden />
                </Link>
              </div>
            )}

            {leadFace && (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-label-lg text-label-lg text-on-surface">
                    {activeCluster
                      ? "Siapa ini?"
                      : activeFace && isIgnored(activeFace)
                        ? "Wajah diabaikan"
                        : "Ubah label wajah"}
                  </span>
                  {activeCluster && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" iconOnly icon={ChevronLeft} onClick={() => goToCluster(activeIndex - 1)}>
                        Wajah sebelumnya
                      </Button>
                      <span className="text-label-md font-label-md text-on-surface-variant tabular-nums">
                        {activeIndex + 1}/{queue.length}
                      </span>
                      <Button variant="ghost" size="sm" iconOnly icon={ChevronRight} onClick={() => goToCluster(activeIndex + 1)}>
                        Wajah berikutnya
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-space-md">
                  <img
                    src={leadFace.cropDataUrl}
                    alt=""
                    className="w-24 h-24 rounded-2xl object-cover ring-[3px] ring-primary-container ring-offset-2 ring-offset-surface-card shrink-0"
                  />
                  <div className="min-w-0 flex flex-col gap-1">
                    {leadParticipant ? (
                      <>
                        <span className="font-headline-sm text-headline-sm text-on-surface truncate">
                          {leadParticipant.displayName}
                        </span>
                        <span className="text-body-sm text-on-surface-variant truncate">
                          {[leadParticipant.jobTitle, leadParticipant.organization].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </>
                    ) : (
                      <span className="text-body-sm text-on-surface-variant">
                        {activeCluster && activeCluster.faces.length > 1
                          ? `Muncul di ${new Set(activeCluster.faces.map((f) => f.photoId)).size} foto (${activeCluster.faces.length} wajah)`
                          : "1 wajah"}
                      </span>
                    )}
                    <span className="flex flex-wrap gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-label-sm font-label-sm ${qualityLabel(leadFace.qualityScore).cls}`}>
                        {qualityLabel(leadFace.qualityScore).text}
                      </span>
                      {leadFace.source === "manual" && (
                        <span className="rounded-full px-2 py-0.5 text-label-sm font-label-sm bg-surface-container text-on-surface-variant">
                          ditandai manual
                        </span>
                      )}
                      {!embeddingByFace.has(leadFace.id) && (
                        <span className="rounded-full px-2 py-0.5 text-label-sm font-label-sm bg-surface-container text-on-surface-variant" title="Wajah terlalu kecil/buram untuk dicocokkan otomatis">
                          tanpa pencocokan AI
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {activeCluster && activeCluster.faces.length > 1 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-body-sm text-on-surface-variant">
                      Wajah dalam kelompok ini — hapus centang yang <strong>bukan</strong> orang yang sama:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {activeCluster.faces.map((f) => {
                        const off = excluded.has(f.id);
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() =>
                              setExcluded((s) => {
                                const next = new Set(s);
                                if (next.has(f.id)) next.delete(f.id);
                                else next.add(f.id);
                                return next;
                              })
                            }
                            onDoubleClick={() => setViewPhotoId(f.photoId)}
                            className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 transition ${
                              off ? "border-transparent opacity-35 grayscale" : "border-primary-container"
                            }`}
                            title={off ? "Tidak ikut dinamai (klik untuk menyertakan)" : "Ikut dinamai (klik untuk mengecualikan)"}
                            aria-pressed={!off}
                          >
                            <img src={f.cropDataUrl} alt="" className="w-full h-full object-cover" />
                            <span
                              className={`absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center ${
                                off ? "bg-white/80 text-outline" : "bg-primary-container text-white"
                              }`}
                            >
                              {!off && <Check size={10} strokeWidth={3} />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeFace && isIgnored(activeFace) ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-body-sm text-on-surface-variant">
                      Wajah ini ditandai bukan peserta (panitia, orang lewat, atau bukan wajah).
                    </p>
                    <Button variant="primary" icon={RotateCcw} onClick={() => resetFace(activeFace)} disabled={busy}>
                      Pulihkan ke antrean
                    </Button>
                  </div>
                ) : (
                  <>
                    {suggestions.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <span className="flex items-center gap-1 text-label-sm font-label-sm uppercase tracking-wide text-on-surface-variant">
                          <Sparkles size={13} className="text-primary" aria-hidden /> Mungkin sama dengan
                        </span>
                        {suggestions.map((s) => {
                          const strong = s.similarity >= SUGGEST_STRONG;
                          return (
                            <button
                              key={s.participant.id}
                              type="button"
                              onClick={() => assign({ kind: "existing", participant: s.participant })}
                              disabled={busy || targetFaces.length === 0}
                              className="group flex items-center gap-2.5 p-2 rounded-xl border border-border-subtle hover:border-primary-container hover:bg-surface-container-low text-left transition-colors disabled:opacity-50"
                            >
                              <Avatar src={faceIndex.get(s.participant.id)?.faceUrl} name={s.participant.displayName} size={36} />
                              <span className="min-w-0 flex-1">
                                <span className="block font-label-lg text-label-lg text-on-surface truncate group-hover:text-primary">
                                  {s.participant.displayName}
                                </span>
                                <span className="block text-body-sm text-on-surface-variant truncate">
                                  {s.participant.organization ?? `${faceIndex.get(s.participant.id)?.faceCount ?? 0} wajah`}
                                </span>
                              </span>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-label-sm font-label-sm ${
                                  strong ? "bg-confidence-high/15 text-[#047857]" : "bg-confidence-medium/15 text-[#b45309]"
                                }`}
                                title={`Kemiripan ${(s.similarity * 100).toFixed(0)}%`}
                              >
                                {strong ? "sangat mirip" : "mirip"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <label className="text-label-md font-label-md text-on-surface-variant">
                        {activeFace ? "Ganti ke peserta lain" : "Cari atau ketik nama peserta"}
                      </label>
                      <NameCombobox
                        ref={comboRef}
                        participants={participants}
                        faceIndex={faceIndex}
                        value={nameInput}
                        onChange={setNameInput}
                        onPick={assign}
                        blocked={blocked}
                        currentId={currentParticipantId}
                        disabled={targetFaces.length === 0}
                        busy={busy}
                        onEmptyKey={(key) => {
                          if (key === "undo") undo();
                          else if (activeIndex >= 0) goToCluster(activeIndex + (key === "next" ? 1 : -1));
                        }}
                      />
                      {activeCluster && excluded.size > 0 && (
                        <span className="text-body-sm text-on-surface-variant">
                          {targetFaces.length} dari {activeCluster.faces.length} wajah akan dinamai.
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      {activeCluster && (
                        <div className="grid grid-cols-2 gap-2">
                          <Button variant="secondary" icon={ChevronRight} onClick={() => goToCluster(activeIndex + 1)} disabled={queue.length < 2}>
                            Lewati dulu
                          </Button>
                          <Button
                            variant="secondary"
                            icon={UserX}
                            onClick={ignoreTarget}
                            disabled={busy || targetFaces.length === 0}
                            className="hover:text-error"
                            title="Panitia, orang lewat, atau bukan wajah"
                          >
                            Bukan peserta
                          </Button>
                        </div>
                      )}
                      {activeFace && (
                        <div className="grid grid-cols-2 gap-2">
                          {activeFace.participantId && leadParticipant?.primaryFaceId !== activeFace.id && (
                            <Button variant="secondary" icon={Star} onClick={() => setPrimary(activeFace)} disabled={busy}>
                              Jadikan foto profil
                            </Button>
                          )}
                          <Button variant="secondary" icon={UserMinus} onClick={() => resetFace(activeFace)} disabled={busy}>
                            Lepas label
                          </Button>
                          <Button variant="secondary" icon={UserX} onClick={ignoreTarget} disabled={busy} className="hover:text-error">
                            Bukan peserta
                          </Button>
                          {activeFace.source === "manual" && (
                            <Button variant="dangerGhost" icon={Trash2} onClick={() => deleteManual(activeFace)} disabled={busy}>
                              Hapus kotak
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {activeFace && leadParticipant && (faceIndex.get(leadParticipant.id)?.faces.length ?? 0) > 1 && (
                  <div className="flex flex-col gap-1.5 pt-2 border-t border-border-subtle">
                    <span className="text-body-sm text-on-surface-variant">Wajah lain milik {leadParticipant.displayName}:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {faceIndex.get(leadParticipant.id)!.faces.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => selectFace(f)}
                          className={`relative w-11 h-11 rounded-lg overflow-hidden border-2 ${
                            f.id === activeFace.id ? "border-primary-container" : "border-transparent hover:border-outline-variant"
                          }`}
                        >
                          <img src={f.cropDataUrl} alt="" className="w-full h-full object-cover" />
                          {leadParticipant.primaryFaceId === f.id && (
                            <Star size={12} className="absolute top-0.5 right-0.5 fill-[#f59e0b] text-[#f59e0b]" aria-label="foto profil" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      {/* queue */}
      <section className="mt-space-md rounded-2xl bg-surface-card border border-border-subtle shadow-xs">
        <div role="tablist" className="flex gap-1 border-b border-border-subtle px-2 pt-2 overflow-x-auto scroll-thin">
          {(
            [
              ["todo", `Perlu dinamai (${queue.length})`],
              ["done", `Sudah dinamai (${participantsWithFaces.length} peserta)`],
              ["ignored", `Diabaikan (${ignoredFaces.length})`],
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`shrink-0 px-3 py-2 -mb-px border-b-2 font-label-md text-label-md transition-colors ${
                tab === key ? "border-primary-container text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-3">
          {tab === "todo" &&
            (queue.length === 0 ? (
              <p className="py-3 text-body-sm text-on-surface-variant">Tidak ada wajah yang menunggu nama.</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto scroll-thin pb-1">
                {queue.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => goToCluster(i)}
                    className={`relative shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition ${
                      i === activeIndex ? "border-primary-container ring-2 ring-primary-container/30" : "border-transparent hover:border-outline-variant"
                    }`}
                    title={`Kelompok ${i + 1}: ${c.faces.length} wajah`}
                  >
                    <img src={c.faces[0].cropDataUrl} alt="" className="w-full h-full object-cover" />
                    {c.faces.length > 1 && (
                      <span className="absolute bottom-0.5 right-0.5 rounded-full bg-surface-card/95 px-1.5 text-[10px] font-bold text-on-surface shadow">
                        ×{c.faces.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}

          {tab === "done" && (
            <div className="flex flex-col gap-3">
              {participantsWithFaces.length === 0 && (
                <p className="text-body-sm text-on-surface-variant">Belum ada wajah yang dinamai.</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {participantsWithFaces.map((p) => {
                  const info = faceIndex.get(p.id)!;
                  return (
                    <div key={p.id} className="flex items-center gap-2.5 rounded-xl border border-border-subtle p-2">
                      <Avatar src={info.faceUrl} name={p.displayName} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="font-label-lg text-label-lg text-on-surface truncate">{p.displayName}</div>
                        <div className="flex gap-1 mt-1 overflow-x-auto scroll-thin">
                          {info.faces.map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => selectFace(f)}
                              className={`shrink-0 w-8 h-8 rounded-md overflow-hidden border-2 ${
                                effective?.type === "face" && effective.faceId === f.id ? "border-primary-container" : "border-transparent hover:border-outline-variant"
                              }`}
                              title="Klik untuk mengubah label wajah ini"
                            >
                              <img src={f.cropDataUrl} alt="" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {participantsWithoutFaces.length > 0 && (
                <div className="rounded-xl bg-surface-slate p-3">
                  <div className="text-label-md font-label-md text-on-surface">
                    Belum punya wajah ({participantsWithoutFaces.length})
                  </div>
                  <p className="text-body-sm text-on-surface-variant">
                    Cari wajah mereka di foto (kotak oranye), atau tandai manual kalau tidak terdeteksi.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {participantsWithoutFaces.map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-card border border-border-subtle pl-1 pr-2.5 py-0.5 text-body-sm">
                        <Avatar name={p.displayName} size={20} />
                        {p.displayName}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "ignored" &&
            (ignoredFaces.length === 0 ? (
              <p className="py-3 text-body-sm text-on-surface-variant">Tidak ada wajah yang diabaikan.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {ignoredFaces.map((f) => (
                  <div key={f.id} className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => selectFace(f)}
                      className={`w-16 h-16 rounded-xl overflow-hidden border-2 grayscale hover:grayscale-0 ${
                        effective?.type === "face" && effective.faceId === f.id ? "border-primary-container grayscale-0" : "border-transparent"
                      }`}
                    >
                      <img src={f.cropDataUrl} alt="" className="w-full h-full object-cover" />
                    </button>
                    <button
                      type="button"
                      onClick={() => resetFace(f)}
                      className="text-label-sm font-label-sm text-primary hover:underline"
                      disabled={busy}
                    >
                      Pulihkan
                    </button>
                  </div>
                ))}
              </div>
            ))}
        </div>
      </section>

      <StepFooterNav
        backHref={`/classes/${classGroupId}/participants`}
        backLabel="Peserta & Foto"
        nextHref={`/classes/${classGroupId}/seating`}
        nextLabel="Lanjut ke Denah Ruangan"
        hint={queue.length > 0 ? `${queue.length} kelompok wajah belum dinamai — bisa dilanjutkan nanti.` : undefined}
      />
    </div>
  );
}
