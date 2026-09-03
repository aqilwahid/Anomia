"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { DetectedFace } from "@/domain/face";
import { localStore } from "@/store/localStore";
import { cosineSimilarity } from "@/face/pipeline";
import { clusterBySimilarity } from "@/face/cluster";
import { useClassData } from "./useClassData";
import { StepFooterNav } from "./StepFooterNav";

const CLUSTER_THRESHOLD = 0.6;
const SUGGESTION_THRESHOLD = 0.4;

interface FaceCluster {
  key: string;
  faceIds: string[];
  faces: DetectedFace[];
}

export function LabelingStep({ classGroupId }: { classGroupId: string }) {
  const { participants, faces, embeddings, loading, reload } = useClassData(classGroupId);
  const [activeIndex, setActiveIndex] = useState(0);
  const [nameInput, setNameInput] = useState("");
  const [busy, setBusy] = useState(false);

  const embeddingByFaceId = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const e of embeddings) map.set(e.detectedFaceId, e.vector);
    return map;
  }, [embeddings]);

  const clusters = useMemo<FaceCluster[]>(() => {
    const unlabeled = faces.filter((f) => f.status === "unlabeled");
    const withEmbedding = unlabeled.filter((f) => embeddingByFaceId.has(f.id));
    if (withEmbedding.length === 0) return [];

    const vectors = withEmbedding.map((f) => embeddingByFaceId.get(f.id)!);
    const clusterIndices = clusterBySimilarity(vectors, CLUSTER_THRESHOLD);

    const groups = new Map<number, DetectedFace[]>();
    withEmbedding.forEach((face, i) => {
      const idx = clusterIndices[i];
      if (!groups.has(idx)) groups.set(idx, []);
      groups.get(idx)!.push(face);
    });

    return Array.from(groups.entries())
      .map(([idx, groupFaces]) => ({ key: `cluster-${idx}`, faceIds: groupFaces.map((f) => f.id), faces: groupFaces }))
      .sort((a, b) => b.faces.length - a.faces.length);
  }, [faces, embeddingByFaceId]);

  const activeCluster = clusters[Math.min(activeIndex, clusters.length - 1)] ?? null;
  const activeFace = activeCluster?.faces[0] ?? null;

  const assignedCount = faces.filter((f) => f.status === "assigned").length;
  const totalCount = faces.length;

  // Real similarity suggestions against already-labeled participants' average embedding.
  const suggestions = useMemo(() => {
    if (!activeFace) return [];
    const activeVector = embeddingByFaceId.get(activeFace.id);
    if (!activeVector) return [];

    const byParticipant = new Map<string, number[][]>();
    for (const f of faces) {
      if (f.status !== "assigned" || !f.participantId) continue;
      const vec = embeddingByFaceId.get(f.id);
      if (!vec) continue;
      if (!byParticipant.has(f.participantId)) byParticipant.set(f.participantId, []);
      byParticipant.get(f.participantId)!.push(vec);
    }

    const results: Array<{ participantId: string; displayName: string; similarity: number }> = [];
    for (const [participantId, vectors] of byParticipant) {
      const dim = vectors[0].length;
      const avg = new Array(dim).fill(0);
      for (const v of vectors) for (let i = 0; i < dim; i++) avg[i] += v[i] / vectors.length;
      const similarity = cosineSimilarity(activeVector, avg);
      if (similarity >= SUGGESTION_THRESHOLD) {
        const participant = participants.find((p) => p.id === participantId);
        if (participant) results.push({ participantId, displayName: participant.displayName, similarity });
      }
    }
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, 2);
  }, [activeFace, embeddingByFaceId, faces, participants]);

  const goToNext = useCallback(() => {
    setNameInput("");
    setActiveIndex(0);
  }, []);

  async function confirmAssign(displayName: string) {
    if (!activeCluster || !displayName.trim() || busy) return;
    setBusy(true);
    try {
      const trimmed = displayName.trim();
      const existing = participants.find((p) => p.displayName.toLowerCase() === trimmed.toLowerCase());
      const participant = existing ?? (await localStore.createParticipant(classGroupId, trimmed));
      await localStore.assignFacesToParticipant(activeCluster.faceIds, participant.id);
      await reload();
      goToNext();
    } finally {
      setBusy(false);
    }
  }

  async function skipAsNotAFace() {
    if (!activeCluster || busy) return;
    setBusy(true);
    try {
      await localStore.rejectFaces(activeCluster.faceIds);
      await reload();
      goToNext();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        skipAsNotAFace();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCluster, busy]);

  return (
    <div className="w-full px-layout-gutter-mobile md:px-layout-gutter-desktop py-space-md">
      <div className="w-full bg-surface-card rounded-xl p-space-md shadow-sm mb-space-md flex flex-col md:flex-row items-start md:items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[24px]">face</span>
          </div>
          <div>
            <div className="flex items-center gap-space-xs">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary font-bold">
                Langkah 3 dari 4
              </span>
            </div>
            <h1 className="font-headline-md text-headline-md text-on-surface">
              Pasang Nama Peserta ke Wajah yang Terdeteksi
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-space-md w-full md:w-auto justify-between md:justify-end">
          <div className="flex flex-col text-left md:text-right">
            <span className="font-label-md text-label-md text-on-surface">
              {assignedCount} dari {totalCount} wajah sudah dinamai
            </span>
            <span className="font-body-sm text-body-sm text-confidence-medium">
              {totalCount - assignedCount} wajah belum memiliki nama
            </span>
          </div>
          <div className="w-28 bg-surface-container-high h-2.5 rounded-full overflow-hidden shrink-0">
            <div
              className="bg-primary-container h-full rounded-full"
              style={{ width: totalCount ? `${(assignedCount / totalCount) * 100}%` : "0%" }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md">
        <div className="lg:col-span-8 flex flex-col gap-space-md">
          <div className="relative w-full bg-surface-card rounded-xl overflow-hidden shadow-sm aspect-[16/10] max-h-[420px] flex items-center justify-center">
            {activeFace ? (
              <FaceOverlayPhoto face={activeFace} />
            ) : (
              <p className="text-sm text-on-surface-variant">
                {loading ? "Memuat…" : "Tidak ada wajah yang menunggu label."}
              </p>
            )}
          </div>

          <div className="bg-surface-card rounded-xl p-space-md shadow-sm">
            <div className="flex items-center justify-between mb-space-sm">
              <div className="flex items-center gap-space-xs">
                <span className="font-headline-sm text-headline-sm text-on-surface">Daftar Wajah Terdeteksi</span>
                <span className="px-space-xs py-0.5 rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm">
                  {clusters.length} Kelompok
                </span>
              </div>
            </div>
            <div className="flex items-center gap-space-sm overflow-x-auto pb-space-xs">
              {clusters.map((cluster, i) => (
                <button
                  key={cluster.key}
                  type="button"
                  onClick={() => {
                    setActiveIndex(i);
                    setNameInput("");
                  }}
                  className={`flex flex-col items-center gap-1 shrink-0 p-1 rounded-lg transition-colors focus:outline-none ${
                    i === activeIndex ? "bg-primary/10 shadow-sm" : "bg-surface-slate hover:bg-surface-container-high"
                  }`}
                >
                  <div
                    className={`relative w-14 h-14 rounded-lg overflow-hidden bg-surface-container ${
                      i === activeIndex ? "shadow-[0_0_0_2px_#2563EB]" : ""
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cluster.faces[0].cropDataUrl} alt="" className="w-full h-full object-cover" />
                    {cluster.faces.length > 1 && (
                      <span className="absolute bottom-1 right-1 rounded-full bg-surface-card/90 text-on-surface px-1 text-[10px] font-bold shadow">
                        ×{cluster.faces.length}
                      </span>
                    )}
                  </div>
                  <span className="font-label-sm text-label-sm text-on-surface-variant truncate max-w-[60px]">
                    Wajah {i + 1}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col">
          <div className="bg-surface-card rounded-xl p-space-md shadow-sm flex flex-col h-full justify-between gap-space-md">
            {activeCluster ? (
              <div className="flex flex-col gap-space-md">
                <div className="flex items-center justify-between pb-space-xs">
                  <span className="font-label-lg text-label-lg text-on-surface">Target Wajah Terpilih</span>
                  <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-surface-container-high text-primary">
                    #{activeIndex + 1} dari {clusters.length}
                  </span>
                </div>

                <div className="flex items-center gap-space-md bg-surface-slate p-space-md rounded-xl">
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-surface-card shadow-[0_0_0_2px_#2563EB] shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={activeCluster.faces[0].cropDataUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-label-sm text-label-sm text-outline">Kualitas Deteksi AI</span>
                    <div className="flex items-center gap-1.5 my-1">
                      <span className="w-2 h-2 rounded-full bg-confidence-high" />
                      <span className="font-label-md text-label-md text-confidence-high">
                        {(activeCluster.faces[0].qualityScore * 100).toFixed(0)}% Jelas &amp; Terang
                      </span>
                    </div>
                    <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
                      Muncul di {activeCluster.faces.length} foto
                    </span>
                  </div>
                </div>

                {suggestions.length > 0 && (
                  <div className="flex flex-col gap-space-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                        Mungkin Sama Dengan
                      </span>
                      <span className="font-label-sm text-label-sm text-primary flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[14px]">auto_awesome</span> AI Match
                      </span>
                    </div>
                    {suggestions.map((s) => (
                      <button
                        key={s.participantId}
                        type="button"
                        onClick={() => confirmAssign(s.displayName)}
                        disabled={busy}
                        className="group flex items-center justify-between p-space-sm rounded-lg bg-surface-slate hover:bg-surface-container-high transition-all text-left shadow-sm"
                      >
                        <p className="font-label-md text-label-md text-on-surface truncate group-hover:text-primary">
                          {s.displayName}
                        </p>
                        <span className="px-space-xs py-0.5 rounded-full bg-confidence-high/15 text-confidence-high font-label-sm text-label-sm font-bold shrink-0">
                          {(s.similarity * 100).toFixed(0)}%
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-space-xs">
                  <label className="font-label-sm text-label-sm text-on-surface-variant font-bold">
                    Cari / Ketik Nama Peserta
                  </label>
                  <input
                    list="participant-roster"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        confirmAssign(nameInput);
                      }
                    }}
                    placeholder="Ketik nama peserta…"
                    className="w-full px-3 py-2 bg-surface-slate rounded-lg text-on-surface font-body-md text-body-md shadow-inner focus:outline-none focus:bg-surface-card"
                  />
                  <datalist id="participant-roster">
                    {participants.map((p) => (
                      <option key={p.id} value={p.displayName} />
                    ))}
                  </datalist>
                </div>

                <div className="flex flex-col gap-space-xs pt-space-xs">
                  <button
                    type="button"
                    onClick={() => confirmAssign(nameInput)}
                    disabled={busy || !nameInput.trim()}
                    className="w-full py-2.5 px-space-md rounded-lg bg-primary text-on-primary hover:bg-primary-container disabled:opacity-40 transition-all font-label-md text-label-md shadow-sm flex items-center justify-center gap-space-xs"
                  >
                    <span>Konfirmasi &amp; Wajah Berikutnya</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-on-primary/20 text-on-primary font-label-sm text-label-sm font-mono">
                      Enter ↵
                    </kbd>
                  </button>
                  <div className="flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm px-1">
                    <button
                      type="button"
                      onClick={skipAsNotAFace}
                      disabled={busy}
                      className="hover:text-error flex items-center gap-1 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">person_off</span>
                      <span>Bukan Peserta (Skip)</span>
                    </button>
                    <span className="text-outline">Shortcut: [Esc]</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant">Tidak ada wajah aktif.</p>
            )}
          </div>
        </div>
      </div>

      <StepFooterNav
        backHref={`/classes/${classGroupId}/participants`}
        backLabel="Kembali ke Peserta & Foto (2)"
        nextHref={`/classes/${classGroupId}/seating`}
        nextLabel="Lanjut ke Denah Meja & Penempatan (4)"
      />
    </div>
  );
}

function FaceOverlayPhoto({ face }: { face: DetectedFace }) {
  const [asset, setAsset] = useState<{ dataUrl: string; width: number; height: number } | null | undefined>(
    undefined
  );
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAsset(undefined);
    import("@/store/db").then(async ({ db }) => {
      const photo = await db.photos.get(face.photoId);
      if (!photo) {
        if (!cancelled) setAsset(null);
        return;
      }
      const imageAsset = await db.imageAssets.get(photo.imageAssetId);
      if (cancelled) return;
      if (!imageAsset) {
        setAsset(null);
        return;
      }
      setAsset(imageAsset);
      setPhotoDataUrl(imageAsset.dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [face.photoId]);

  if (asset === undefined) return <div className="w-full h-full bg-surface-slate animate-pulse" />;
  if (asset === null || !photoDataUrl) {
    return (
      <div className="w-24 h-24 rounded-xl overflow-hidden shadow-[0_0_0_3px_#2563EB]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={face.cropDataUrl} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }

  const left = (face.box.x / asset.width) * 100;
  const top = (face.box.y / asset.height) * 100;
  const width = (face.box.width / asset.width) * 100;
  const height = (face.box.height / asset.height) * 100;

  return (
    <div className="relative w-full h-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoDataUrl} alt="" className="w-full h-full object-cover" />
      <div
        className="absolute rounded-lg shadow-[0_0_0_3px_#2563EB] bg-primary-container/10"
        style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
      />
    </div>
  );
}
