"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FacePipeline } from "@/face/pipeline";
import type { PhotoRole } from "@/domain/face";
import type { Participant } from "@/domain/participant";
import { localStore } from "@/store/localStore";
import { useClassData } from "./useClassData";
import { StepFooterNav } from "./StepFooterNav";

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

const MODEL_NAME = "human-faceres";
const MODEL_VERSION = "3.3.6";

export function ParticipantsPhotosStep({ classGroupId }: { classGroupId: string }) {
  const { participants, photos, faces, loading, reload } = useClassData(classGroupId);
  const pipelineRef = useRef<FacePipeline | null>(null);

  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editOrg, setEditOrg] = useState("");

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const [photoRole, setPhotoRole] = useState<PhotoRole>("group");
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const facesByPhoto = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of faces) map.set(f.photoId, (map.get(f.photoId) ?? 0) + 1);
    return map;
  }, [faces]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await localStore.createParticipant(classGroupId, trimmed, organization.trim() || null);
    setName("");
    setOrganization("");
    await reload();
  }

  function startEdit(p: Participant) {
    setEditingId(p.id);
    setEditName(p.displayName);
    setEditOrg(p.organization ?? "");
  }

  async function saveEdit() {
    if (!editingId) return;
    await localStore.updateParticipant(editingId, {
      displayName: editName.trim() || undefined,
      organization: editOrg.trim() || null,
    });
    setEditingId(null);
    await reload();
  }

  async function handleDeleteParticipant(id: string) {
    await localStore.deleteParticipant(id);
    await reload();
  }

  async function handleBulkApply() {
    const names = bulkText.split("\n").map((n) => n.trim()).filter(Boolean);
    if (names.length > 0) await localStore.importRoster(classGroupId, names);
    setBulkText("");
    setBulkOpen(false);
    await reload();
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
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses foto");
    } finally {
      setProcessing(null);
    }
  }

  async function handleDeletePhoto(photoId: string) {
    await localStore.deletePhoto(photoId);
    await reload();
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-layout-gutter-mobile md:px-layout-gutter-desktop py-space-xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md mb-space-xl">
        <div>
          <div className="inline-flex items-center gap-space-xs text-primary font-label-md text-label-md mb-space-2xs">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span>LANGKAH 2 DARI 4</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
            Peserta &amp; Foto Dokumentasi
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            Masukkan daftar orang yang hadir, lalu unggah foto kelas atau grup untuk deteksi otomatis.
          </p>
        </div>
        <div className="flex items-center gap-space-sm bg-surface-card px-space-md py-space-xs rounded-xl shadow-sm">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-confidence-high text-[20px]">groups</span>
            <span className="font-label-lg text-label-lg text-on-surface">{participants.length} Peserta</span>
          </div>
          <span className="w-1 h-4 bg-surface-container-high rounded-full" />
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-primary text-[20px]">photo_library</span>
            <span className="font-label-lg text-label-lg text-on-surface">{photos.length} Foto Siap</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">
        {/* Roster */}
        <div className="lg:col-span-6 flex flex-col gap-space-lg">
          <div className="bg-surface-card rounded-xl p-space-lg shadow-sm">
            <div className="flex items-center justify-between mb-space-md">
              <div className="flex items-center gap-space-xs">
                <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">person_add</span>
                </div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Daftar Nama Peserta</h2>
              </div>
            </div>

            <form onSubmit={handleAdd} className="bg-surface-slate p-space-md rounded-xl space-y-space-sm mb-space-md">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-space-sm">
                <div className="sm:col-span-7">
                  <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                    Nama Lengkap
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Rian Pratama"
                    className="w-full px-3 py-2 bg-surface-card text-on-surface rounded-lg font-body-md text-body-md shadow-sm focus:outline-none focus:shadow-md transition-all"
                  />
                </div>
                <div className="sm:col-span-5">
                  <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                    Divisi / Instansi
                  </label>
                  <input
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="Misal: UI/UX"
                    className="w-full px-3 py-2 bg-surface-card text-on-surface rounded-lg font-body-md text-body-md shadow-sm focus:outline-none focus:shadow-md transition-all"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-space-2xs">
                <span className="text-[11px] font-label-sm text-outline">Tekan Enter atau klik Tambah</span>
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className="inline-flex items-center gap-1.5 px-space-md py-2 bg-primary text-on-primary rounded-lg font-label-md text-label-md hover:bg-primary-container disabled:opacity-40 transition-all shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  <span>Tambah</span>
                </button>
              </div>
            </form>

            <div className="flex items-center gap-space-sm p-space-sm bg-surface-container-low rounded-xl mb-space-md">
              <div className="w-7 h-7 rounded-md bg-surface-card flex items-center justify-center text-secondary shrink-0">
                <span className="material-symbols-outlined text-[18px]">file_upload</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-label-md text-label-md text-on-surface">Punya daftar nama banyak sekaligus?</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                  Salin teks nama satu per baris.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkOpen(true)}
                className="px-space-sm py-1.5 bg-surface-card hover:bg-surface-container text-primary font-label-md text-label-md rounded-lg shadow-sm transition-colors shrink-0"
              >
                Paste / Impor
              </button>
            </div>

            <div className="flex items-center justify-between py-space-xs font-label-sm text-label-sm text-outline uppercase tracking-wider">
              <span>Nama &amp; Instansi ({participants.length} Orang)</span>
              <span>Aksi</span>
            </div>
            <div className="space-y-space-2xs max-h-[360px] overflow-y-auto pr-1">
              {participants.length === 0 && (
                <p className="py-4 text-sm text-on-surface-variant">Belum ada peserta.</p>
              )}
              {participants.map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-space-sm rounded-lg bg-surface-slate hover:bg-surface-container-low transition-colors group"
                >
                  {editingId === p.id ? (
                    <div className="flex-1 flex items-center gap-space-xs min-w-0">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1 bg-surface-card rounded font-label-md text-label-md"
                      />
                      <input
                        value={editOrg}
                        onChange={(e) => setEditOrg(e.target.value)}
                        placeholder="Divisi"
                        className="w-28 shrink-0 px-2 py-1 bg-surface-card rounded font-body-sm text-body-sm"
                      />
                      <button
                        onClick={saveEdit}
                        className="p-1 rounded text-primary hover:bg-surface-card shrink-0"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[18px]">check</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-space-sm min-w-0">
                        <span className="w-6 h-6 rounded-md bg-surface-container flex items-center justify-center font-label-sm text-label-sm text-primary shrink-0">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0">
                          <p className="font-label-lg text-label-lg text-on-surface truncate">{p.displayName}</p>
                          {p.organization && (
                            <p className="font-body-sm text-body-sm text-outline truncate">{p.organization}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0">
                        <button
                          onClick={() => startEdit(p)}
                          type="button"
                          className="p-1 rounded text-outline hover:text-primary hover:bg-surface-card transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button
                          onClick={() => handleDeleteParticipant(p.id)}
                          type="button"
                          className="p-1 rounded text-outline hover:text-error hover:bg-surface-card transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Photos */}
        <div className="lg:col-span-6 flex flex-col gap-space-lg">
          <div className="bg-surface-card rounded-xl p-space-lg shadow-sm">
            <div className="flex items-center justify-between mb-space-md">
              <div className="flex items-center gap-space-xs">
                <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">add_photo_alternate</span>
                </div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Foto Dokumentasi Pelatihan</h2>
              </div>
            </div>

            <div className="flex items-center gap-space-md mb-space-sm">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" checked={photoRole === "group"} onChange={() => setPhotoRole("group")} />
                Foto grup / kelas
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" checked={photoRole === "portrait"} onChange={() => setPhotoRole("portrait")} />
                Portrait / close-up
              </label>
            </div>

            <div className="relative bg-surface-slate hover:bg-surface-container-low transition-all rounded-xl p-space-xl flex flex-col items-center justify-center text-center cursor-pointer shadow-sm group">
              <input
                accept="image/*"
                className="absolute inset-0 opacity-0 cursor-pointer"
                multiple
                type="file"
                disabled={!!processing}
                onChange={(e) => handleUpload(e.target.files)}
              />
              <div className="w-14 h-14 rounded-full bg-surface-card group-hover:scale-110 group-hover:bg-primary group-hover:text-on-primary text-primary transition-all flex items-center justify-center shadow-sm mb-space-sm">
                <span className="material-symbols-outlined text-[28px]">cloud_upload</span>
              </div>
              <p className="font-label-lg text-label-lg text-on-surface mb-1">Batch Upload Foto Kelas &amp; Dokumentasi</p>
              <p className="font-body-sm text-body-sm text-outline max-w-sm">
                Semakin banyak sudut foto, deteksi wajah semakin akurat (JPG, PNG).
              </p>
            </div>
            {processing && <p className="mt-2 text-sm text-on-surface-variant">{processing}</p>}
            {error && <p className="mt-2 text-sm text-error">{error}</p>}

            {photos.length > 0 && (
              <div className="mt-space-lg">
                <div className="flex items-center justify-between mb-space-sm">
                  <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
                    Foto Terunggah ({photos.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                  {photos.map((photo) => (
                    <div
                      key={photo.id}
                      className="relative rounded-xl overflow-hidden bg-surface-slate shadow-sm group h-32"
                    >
                      <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-card/90 text-primary font-label-sm text-[11px] backdrop-blur-sm shadow-sm z-10">
                        <span className="w-1.5 h-1.5 rounded-full bg-confidence-high" />
                        <span>{facesByPhoto.get(photo.id) ?? 0} wajah terdeteksi</span>
                      </div>
                      <button
                        onClick={() => handleDeletePhoto(photo.id)}
                        type="button"
                        className="absolute top-2 right-2 z-10 w-7 h-7 rounded bg-surface-card/90 hover:bg-error hover:text-on-error text-outline transition-colors flex items-center justify-center shrink-0"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                      <PhotoThumb photoId={photo.imageAssetId} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {!loading && (
        <StepFooterNav
          backHref={`/classes/${classGroupId}`}
          backLabel="Kembali ke Info Kelas"
          nextHref={`/classes/${classGroupId}/labeling`}
          nextLabel={`Lanjut: Pasang Nama ke Wajah (${faces.length})`}
        />
      )}

      {bulkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 backdrop-blur-sm p-space-md">
          <div className="bg-surface-card rounded-xl max-w-lg w-full p-space-lg shadow-xl relative">
            <div className="flex items-center justify-between mb-space-sm">
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Impor Banyak Nama Sekaligus</h3>
              <button onClick={() => setBulkOpen(false)} type="button" className="text-outline hover:text-on-surface p-1 rounded">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
              Tempel daftar nama peserta, satu nama per baris.
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              className="w-full p-space-sm bg-surface-slate text-on-surface rounded-lg font-body-md text-body-md focus:outline-none shadow-inner mb-space-md resize-none"
              placeholder={"Rian Pratama\nSiti Rahma\nBudi Santoso"}
              rows={6}
            />
            <div className="flex items-center justify-end gap-space-xs">
              <button
                onClick={() => setBulkOpen(false)}
                type="button"
                className="px-space-md py-2 text-outline hover:text-on-surface font-label-md text-label-md"
              >
                Batal
              </button>
              <button
                onClick={handleBulkApply}
                type="button"
                className="px-space-lg py-2 bg-primary hover:bg-primary-container text-on-primary rounded-lg font-label-md text-label-md shadow-sm"
              >
                Terapkan Nama
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoThumb({ photoId }: { photoId: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    import("@/store/db").then(({ db }) => {
      db.imageAssets.get(photoId).then((asset) => {
        if (!cancelled) setDataUrl(asset?.dataUrl ?? null);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [photoId]);
  if (!dataUrl) return <div className="w-full h-full bg-surface-container animate-pulse" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={dataUrl} alt="" className="w-full h-full object-cover" />;
}
