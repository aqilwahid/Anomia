"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { localStore } from "@/store/localStore";
import type { ClassGroup, Participant } from "@/domain/participant";
import type { DetectedFace, PhotoRole } from "@/domain/face";
import type { FacePipeline } from "@/face/pipeline";
import { clusterBySimilarity } from "@/face/cluster";

const MODEL_NAME = "human-faceres";
const MODEL_VERSION = "3.3.6";
const CLUSTER_THRESHOLD = 0.6;

interface FaceCluster {
  key: string;
  faceIds: string[];
  faces: DetectedFace[];
}

function loadImage(file: File): Promise<{ img: HTMLImageElement; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new window.Image();
      img.onload = () => resolve({ img, dataUrl });
      img.onerror = () => reject(new Error(`Gagal memuat gambar: ${file.name}`));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error(`Gagal membaca file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export function ClassWorkspace({ classGroupId }: { classGroupId: string }) {
  const router = useRouter();
  const pipelineRef = useRef<FacePipeline | null>(null);

  const [classGroup, setClassGroup] = useState<ClassGroup | null | undefined>(undefined);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [faces, setFaces] = useState<DetectedFace[]>([]);
  const [embeddingsByFaceId, setEmbeddingsByFaceId] = useState<Map<string, number[]>>(new Map());

  const [rosterText, setRosterText] = useState("");
  const [importing, setImporting] = useState(false);

  const [photoRole, setPhotoRole] = useState<PhotoRole>("group");
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [cg, parts, fcs, embs] = await Promise.all([
      localStore.getClassGroup(classGroupId),
      localStore.listParticipants(classGroupId),
      localStore.listDetectedFaces(classGroupId),
      localStore.listEmbeddings(classGroupId),
    ]);
    setClassGroup(cg ?? null);
    setParticipants(parts);
    setFaces(fcs);
    setEmbeddingsByFaceId(new Map(embs.map((e) => [e.detectedFaceId, e.vector])));
  }, [classGroupId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const clusters = useMemo<FaceCluster[]>(() => {
    const unlabeled = faces.filter((f) => f.status === "unlabeled");
    const withEmbedding = unlabeled.filter((f) => embeddingsByFaceId.has(f.id));
    if (withEmbedding.length === 0) return [];

    const embeddings = withEmbedding.map((f) => embeddingsByFaceId.get(f.id)!);
    const clusterIndices = clusterBySimilarity(embeddings, CLUSTER_THRESHOLD);

    const groups = new Map<number, DetectedFace[]>();
    withEmbedding.forEach((face, i) => {
      const idx = clusterIndices[i];
      if (!groups.has(idx)) groups.set(idx, []);
      groups.get(idx)!.push(face);
    });

    return Array.from(groups.entries())
      .map(([idx, groupFaces]) => ({
        key: `cluster-${idx}`,
        faceIds: groupFaces.map((f) => f.id),
        faces: groupFaces,
      }))
      .sort((a, b) => b.faces.length - a.faces.length);
  }, [faces, embeddingsByFaceId]);

  const facesByParticipant = useMemo(() => {
    const map = new Map<string, DetectedFace[]>();
    for (const face of faces) {
      if (face.status !== "assigned" || !face.participantId) continue;
      if (!map.has(face.participantId)) map.set(face.participantId, []);
      map.get(face.participantId)!.push(face);
    }
    return map;
  }, [faces]);

  const rejectedCount = useMemo(() => faces.filter((f) => f.status === "not_a_face").length, [faces]);

  async function handleImportRoster(e: React.FormEvent) {
    e.preventDefault();
    const names = rosterText.split("\n").map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    setImporting(true);
    try {
      await localStore.importRoster(classGroupId, names);
      setRosterText("");
      await load();
    } finally {
      setImporting(false);
    }
  }

  async function ensurePipeline(): Promise<FacePipeline> {
    if (!pipelineRef.current) {
      const { HumanFacePipeline } = await import("@/face/humanPipeline");
      pipelineRef.current = new HumanFacePipeline();
    }
    await pipelineRef.current.init();
    return pipelineRef.current;
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setError(null);
    try {
      setProcessing("Menyiapkan model deteksi wajah…");
      const pipeline = await ensurePipeline();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProcessing(`Memproses foto ${i + 1}/${files.length}: ${file.name}`);
        const { img, dataUrl } = await loadImage(file);
        const rawFaces = await pipeline.detect(img);

        await localStore.addPhotoWithFaces({
          classGroupId,
          dataUrl,
          width: img.naturalWidth,
          height: img.naturalHeight,
          role: photoRole,
          faces: rawFaces.map((f) => ({
            face: {
              box: f.box,
              cropDataUrl: f.cropDataUrl,
              detectorScore: f.detectorScore,
              qualityScore: f.qualityScore,
              status: "unlabeled" as const,
              participantId: null,
            },
            embedding: f.embedding,
            modelName: MODEL_NAME,
            modelVersion: MODEL_VERSION,
          })),
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses foto");
    } finally {
      setProcessing(null);
    }
  }

  async function handleAssign(faceIds: string[], participantName: string) {
    const trimmed = participantName.trim();
    if (!trimmed) return;
    const existing = participants.find(
      (p) => p.displayName.toLowerCase() === trimmed.toLowerCase()
    );
    const participant = existing ?? (await localStore.createParticipant(classGroupId, trimmed));
    await localStore.assignFacesToParticipant(faceIds, participant.id);
    await load();
  }

  async function handleReject(faceIds: string[]) {
    await localStore.rejectFaces(faceIds);
    await load();
  }

  async function handleDeleteClass() {
    if (!classGroup) return;
    if (!confirm(`Hapus kelas "${classGroup.name}"? Semua foto, wajah, dan data peserta akan dihapus permanen.`)) {
      return;
    }
    await localStore.deleteClassGroup(classGroupId);
    router.push("/");
  }

  if (classGroup === undefined) {
    return <div className="mx-auto max-w-4xl px-6 py-12 text-sm text-neutral-400">Memuat…</div>;
  }
  if (classGroup === null) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <p className="text-sm text-neutral-500">Kelas tidak ditemukan.</p>
        <Link href="/" className="text-sm underline">
          Kembali
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/" className="text-xs text-neutral-400 hover:underline">
            ← Semua kelas
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{classGroup.name}</h1>
          <p className="text-sm text-neutral-500">
            {participants.length} peserta · {faces.length} wajah terdeteksi
            {rejectedCount > 0 ? ` · ${rejectedCount} ditandai bukan wajah` : ""}
          </p>
        </div>
        <button
          onClick={handleDeleteClass}
          className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          Hapus kelas
        </button>
      </div>

      {/* Roster */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          1. Roster peserta
        </h2>
        <form onSubmit={handleImportRoster} className="mt-3 flex gap-2">
          <textarea
            value={rosterText}
            onChange={(e) => setRosterText(e.target.value)}
            placeholder={"Tempel daftar nama, satu nama per baris"}
            rows={3}
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
          <button
            type="submit"
            disabled={importing || !rosterText.trim()}
            className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Import
          </button>
        </form>
        {participants.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {participants.map((p) => (
              <span
                key={p.id}
                className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700"
              >
                {p.displayName}
                {facesByParticipant.get(p.id)?.length ? ` (${facesByParticipant.get(p.id)!.length})` : ""}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Upload */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          2. Upload foto
        </h2>
        <div className="mt-3 flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              checked={photoRole === "group"}
              onChange={() => setPhotoRole("group")}
            />
            Foto grup / kelas
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              checked={photoRole === "portrait"}
              onChange={() => setPhotoRole("portrait")}
            />
            Portrait / close-up
          </label>
        </div>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={!!processing}
          onChange={(e) => handleUpload(e.target.files)}
          className="mt-3 block text-sm"
        />
        <p className="mt-1 text-xs text-neutral-400">
          JPEG/PNG dianjurkan. Dukungan HEIC tergantung browser (biasanya bekerja di Safari).
        </p>
        {processing && <p className="mt-2 text-sm text-neutral-500">{processing}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>

      {/* Labeling */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          3. Konfirmasi wajah ({clusters.length} kelompok belum dilabeli)
        </h2>
        {clusters.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">
            Belum ada wajah yang menunggu label. Upload foto di atas untuk mulai.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {clusters.map((cluster) => (
              <ClusterRow
                key={cluster.key}
                cluster={cluster}
                participants={participants}
                onAssign={handleAssign}
                onReject={handleReject}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ClusterRow({
  cluster,
  participants,
  onAssign,
  onReject,
}: {
  cluster: FaceCluster;
  participants: Participant[];
  onAssign: (faceIds: string[], name: string) => Promise<void>;
  onReject: (faceIds: string[]) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const datalistId = `participants-${cluster.key}`;

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onAssign(cluster.faceIds, name);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-neutral-200 p-3">
      <div className="flex -space-x-2">
        {cluster.faces.slice(0, 4).map((f) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={f.id}
            src={f.cropDataUrl}
            alt=""
            className="h-12 w-12 rounded-full border-2 border-white object-cover"
            title={`kualitas ${(f.qualityScore * 100).toFixed(0)}%`}
          />
        ))}
      </div>
      <div className="text-xs text-neutral-400">{cluster.faces.length}x</div>
      <input
        list={datalistId}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Nama peserta…"
        disabled={busy}
        className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
      />
      <datalist id={datalistId}>
        {participants.map((p) => (
          <option key={p.id} value={p.displayName} />
        ))}
      </datalist>
      <button
        onClick={submit}
        disabled={busy || !name.trim()}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
      >
        Konfirmasi
      </button>
      <button
        onClick={() => onReject(cluster.faceIds)}
        disabled={busy}
        className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50"
      >
        Bukan wajah
      </button>
    </div>
  );
}
