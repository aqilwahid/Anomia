"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  FileImage,
  Image as ImageIcon,
  Loader2,
  MoreVertical,
  Pencil,
  ScanFace,
  ScanSearch,
  Search,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { Photo, PhotoRole } from "@/domain/face";
import type { Participant } from "@/domain/participant";
import { localStore } from "@/store/localStore";
import { notifyDataChanged } from "@/store/events";
import { Button } from "@/ui/Button";
import { Avatar } from "@/ui/Avatar";
import { Modal } from "@/ui/Modal";
import { useConfirm, useToast } from "@/ui/Providers";
import { useClassData } from "@/features/classes/useClassData";
import { StepFooterNav } from "@/features/classes/StepFooterNav";
import { PhotoThumb } from "@/features/photos/PhotoThumb";
import { rescanPhoto, uploadPhoto } from "@/features/photos/faceOps";
import { ParticipantEditor } from "./ParticipantEditor";
import { dedupeRoster, parseRoster } from "./roster";

type JobStatus = "queued" | "working" | "done" | "error";
interface UploadJob {
  id: string;
  name: string;
  status: JobStatus;
  progress: number;
  stage: string;
  faces?: number;
  error?: string;
}

const inputClass =
  "w-full h-10 px-3 bg-surface-card border border-border-subtle rounded-lg text-on-surface text-body-md placeholder:text-outline focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/30";

function fold(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function ParticipantsPhotosStep({ classGroupId }: { classGroupId: string }) {
  const { participants, photos, faces, faceIndex, loading, reload } = useClassData(classGroupId);
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Participant | "new" | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const [photoRole, setPhotoRole] = useState<PhotoRole>("group");
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [menuPhotoId, setMenuPhotoId] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState<{ photoId: string; label: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const processing = jobs.some((j) => j.status === "queued" || j.status === "working");

  // leaving the page cancels a running batch (the detector is shared with other pages)
  useEffect(() => () => abortRef.current?.abort(), []);

  const faceStats = useMemo(() => {
    const byPhoto = new Map<string, { total: number; pending: number }>();
    for (const f of faces) {
      if (f.status === "not_a_face" || f.status === "rejected") continue;
      const s = byPhoto.get(f.photoId) ?? { total: 0, pending: 0 };
      s.total++;
      if (f.status === "unlabeled") s.pending++;
      byPhoto.set(f.photoId, s);
    }
    return byPhoto;
  }, [faces]);
  const activeFaceCount = faces.filter((f) => f.status !== "not_a_face" && f.status !== "rejected").length;
  const pendingFaceCount = faces.filter((f) => f.status === "unlabeled").length;

  const filtered = useMemo(() => {
    const q = fold(query);
    if (!q) return participants;
    return participants.filter((p) =>
      [p.displayName, p.organization, p.jobTitle, p.email].some((v) => v && fold(v).includes(q))
    );
  }, [participants, query]);

  /* ------------------------------------------------------------ roster */

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (participants.some((p) => fold(p.displayName) === fold(trimmed))) {
      toast.show({ message: `"${trimmed}" sudah ada di daftar.`, tone: "error" });
      return;
    }
    await localStore.createParticipant(classGroupId, { displayName: trimmed, organization });
    setName("");
    setOrganization("");
    nameInputRef.current?.focus();
    await reload();
    notifyDataChanged();
  }

  async function handleDelete(p: Participant) {
    const faceCount = faceIndex.get(p.id)?.faceCount ?? 0;
    const ok = await confirm({
      title: `Hapus ${p.displayName}?`,
      message:
        faceCount > 0
          ? `${faceCount} wajah yang sudah dinamai "${p.displayName}" akan kembali ke antrean labeling, dan kursinya di denah dikosongkan.`
          : "Peserta dihapus dari daftar dan dari denah.",
      confirmLabel: "Hapus",
      tone: "danger",
    });
    if (!ok) return;
    await localStore.deleteParticipant(p.id);
    await reload();
    notifyDataChanged();
    toast.show({ message: `${p.displayName} dihapus` });
  }

  /* ------------------------------------------------------------ photos */

  async function handleFiles(fileList: FileList | File[] | null) {
    const files = Array.from(fileList ?? []).filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|hei[cf])$/i.test(f.name));
    if (files.length === 0) return;
    if (processing || rescanning) {
      toast.show({ message: "Tunggu proses foto sebelumnya selesai dulu.", tone: "error" });
      return;
    }
    const batch: UploadJob[] = files.map((f, i) => ({
      id: `${Date.now()}-${i}`,
      name: f.name,
      status: "queued",
      progress: 0,
      stage: "Menunggu",
    }));
    setJobs(batch);
    const controller = new AbortController();
    abortRef.current = controller;
    const update = (id: string, patch: Partial<UploadJob>) =>
      setJobs((all) => all.map((j) => (j.id === id ? { ...j, ...patch } : j)));

    let totalFaces = 0;
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      const job = batch[i];
      if (controller.signal.aborted) {
        update(job.id, { status: "error", error: "Dibatalkan" });
        continue;
      }
      update(job.id, { status: "working", stage: "Menyiapkan model deteksi wajah…", progress: 2 });
      try {
        const { faceCount } = await uploadPhoto(
          files[i],
          classGroupId,
          photoRole,
          (p) =>
            update(job.id, {
              stage: p.phase === "scan" ? "Mencari wajah di seluruh foto…" : `Memeriksa wajah ${p.done}/${p.total}…`,
              progress: p.phase === "scan" ? 5 + (p.done / Math.max(1, p.total)) * 55 : 60 + (p.done / Math.max(1, p.total)) * 40,
            }),
          controller.signal
        );
        totalFaces += faceCount;
        update(job.id, { status: "done", progress: 100, faces: faceCount, stage: `${faceCount} wajah` });
        await reload();
      } catch (err) {
        failed++;
        const aborted = err instanceof DOMException && err.name === "AbortError";
        update(job.id, { status: "error", error: aborted ? "Dibatalkan" : err instanceof Error ? err.message : "Gagal diproses" });
      }
    }
    abortRef.current = null;
    notifyDataChanged();
    const ok = files.length - failed;
    if (ok > 0) {
      toast.show({
        message: `${ok} foto diproses · ${totalFaces} wajah terdeteksi`,
        tone: "success",
        action: totalFaces > 0 ? { label: "Pasang nama", onClick: () => router.push(`/classes/${classGroupId}/labeling`) } : undefined,
      });
    }
  }

  async function handleDeletePhoto(photo: Photo) {
    setMenuPhotoId(null);
    const stats = faceStats.get(photo.id);
    const labeled = stats ? stats.total - stats.pending : 0;
    const ok = await confirm({
      title: "Hapus foto ini?",
      message:
        labeled > 0
          ? `Foto beserta ${stats!.total} wajahnya dihapus, termasuk ${labeled} label nama. Peserta tetap ada di daftar.`
          : "Foto beserta wajah yang terdeteksi di dalamnya akan dihapus.",
      confirmLabel: "Hapus foto",
      tone: "danger",
    });
    if (!ok) return;
    await localStore.deletePhoto(photo.id);
    await reload();
    notifyDataChanged();
  }

  async function handleRescan(photo: Photo) {
    setMenuPhotoId(null);
    if (processing || rescanning) {
      toast.show({ message: "Tunggu proses foto yang sedang berjalan selesai dulu.", tone: "error" });
      return;
    }
    setRescanning({ photoId: photo.id, label: "Memuat model…" });
    try {
      const added = await rescanPhoto(photo.id, faces, (p) =>
        setRescanning({
          photoId: photo.id,
          label: p.phase === "scan" ? `Memindai… ${Math.round((p.done / Math.max(1, p.total)) * 100)}%` : `Memeriksa ${p.done}/${p.total}`,
        })
      );
      await reload();
      notifyDataChanged();
      toast.show({
        message: added.length ? `${added.length} wajah baru ditemukan` : "Tidak ada wajah baru. Wajah yang terlewat bisa ditandai manual di Labeling.",
        tone: added.length ? "success" : "default",
      });
    } catch (err) {
      toast.show({ message: err instanceof Error ? err.message : "Gagal memindai ulang", tone: "error" });
    } finally {
      setRescanning(null);
    }
  }

  async function togglePhotoRole(photo: Photo) {
    setMenuPhotoId(null);
    await localStore.updatePhoto(photo.id, { role: photo.role === "group" ? "portrait" : "group" });
    await reload();
  }

  /* ------------------------------------------------------------ render */

  return (
    <div className="w-full max-w-[1400px] mx-auto px-layout-gutter-mobile md:px-layout-gutter-desktop py-space-lg">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md mb-space-lg">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Peserta &amp; Foto</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            Masukkan daftar peserta, lalu unggah foto kelas. Wajah dideteksi langsung di browser ini.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-surface-card border border-border-subtle px-3 py-2 shadow-xs text-label-lg font-label-lg">
          <Users size={17} className="text-confidence-high" aria-hidden /> {participants.length} peserta
          <span className="mx-1 h-4 w-px bg-border-subtle" />
          <ImageIcon size={17} className="text-primary" aria-hidden /> {photos.length} foto
          <span className="mx-1 h-4 w-px bg-border-subtle" />
          <ScanFace size={17} className="text-accent-violet" aria-hidden /> {activeFaceCount} wajah
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
        {/* ------------------------------------------------ roster */}
        <section className="lg:col-span-5 bg-surface-card rounded-2xl border border-border-subtle p-space-md md:p-space-lg shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-space-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Daftar Peserta</h2>
            <div className="flex gap-1.5">
              <Button variant="soft" size="sm" icon={ClipboardPaste} onClick={() => setBulkOpen(true)}>
                Tempel daftar
              </Button>
              <Button variant="ghost" size="sm" icon={UserPlus} onClick={() => setEditing("new")}>
                <span className="hidden sm:inline">Detail lengkap</span>
              </Button>
            </div>
          </div>

          <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2 bg-surface-slate p-2.5 rounded-xl mb-space-md">
            <input
              ref={nameInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama lengkap"
              aria-label="Nama lengkap"
              className={`${inputClass} sm:flex-[3]`}
            />
            <input
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="Instansi / divisi"
              aria-label="Instansi atau divisi"
              className={`${inputClass} sm:flex-[2]`}
            />
            <Button type="submit" variant="primary" icon={UserPlus} disabled={!name.trim()}>
              Tambah
            </Button>
          </form>

          {participants.length > 8 && (
            <div className="relative mb-2">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nama, instansi, jabatan…"
                className={`${inputClass} pl-9 bg-surface-slate`}
              />
            </div>
          )}

          <div className="flex items-center justify-between px-1 pb-1 text-label-sm font-label-sm uppercase tracking-wide text-outline">
            <span>{query ? `${filtered.length} dari ${participants.length}` : `${participants.length} orang`}</span>
            <span>Status wajah</span>
          </div>
          <ul className="flex flex-col gap-1 max-h-[520px] overflow-y-auto pr-1 -mr-1">
            {!loading && participants.length === 0 && (
              <li className="rounded-xl border border-dashed border-outline-variant p-space-md text-center">
                <p className="text-label-lg font-label-lg text-on-surface">Belum ada peserta</p>
                <p className="text-body-sm text-on-surface-variant mt-1">
                  Tambahkan satu per satu, atau <button type="button" className="text-primary underline" onClick={() => setBulkOpen(true)}>tempel daftar</button> dari Excel/WA.
                  Nama juga bisa ditambahkan langsung saat labeling.
                </p>
              </li>
            )}
            {filtered.map((p) => {
              const info = faceIndex.get(p.id);
              const sub = [p.organization, p.jobTitle].filter(Boolean).join(" · ");
              return (
                <li key={p.id} className="group flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface-slate">
                  <Avatar src={info?.faceUrl} name={p.displayName} size={38} />
                  <button type="button" onClick={() => setEditing(p)} className="min-w-0 flex-1 text-left" title="Lihat / ubah detail">
                    <span className="block font-label-lg text-label-lg text-on-surface truncate">{p.displayName}</span>
                    <span className="block text-body-sm text-on-surface-variant truncate">{sub || "—"}</span>
                  </button>
                  {info && info.faceCount > 0 ? (
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-confidence-high/12 px-2 py-0.5 text-label-sm font-label-sm text-[#047857]">
                      <CheckCircle2 size={12} aria-hidden /> {info.faceCount}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-confidence-medium/15 px-2 py-0.5 text-label-sm font-label-sm text-[#b45309]">
                      belum ada
                    </span>
                  )}
                  <span className="flex shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" iconOnly icon={Pencil} onClick={() => setEditing(p)}>
                      Ubah
                    </Button>
                    <Button variant="ghost" size="sm" iconOnly icon={Trash2} onClick={() => handleDelete(p)} className="hover:text-error">
                      Hapus
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ------------------------------------------------ photos */}
        <section className="lg:col-span-7 bg-surface-card rounded-2xl border border-border-subtle p-space-md md:p-space-lg shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-space-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Foto Kelas</h2>
            <div role="radiogroup" aria-label="Jenis foto" className="inline-flex rounded-lg bg-surface-slate p-1 text-label-md font-label-md">
              {(
                [
                  ["group", "Foto grup / kelas"],
                  ["portrait", "Foto per orang"],
                ] as Array<[PhotoRole, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={photoRole === value}
                  onClick={() => setPhotoRole(value)}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    photoRole === value ? "bg-surface-card text-primary shadow-xs" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={`rounded-2xl border-2 border-dashed p-space-lg flex flex-col items-center text-center transition-colors ${
              dragOver ? "border-primary-container bg-surface-container-low" : "border-outline-variant bg-surface-slate"
            }`}
          >
            <span className="w-12 h-12 rounded-full bg-surface-card text-primary flex items-center justify-center shadow-xs mb-2">
              <Upload size={22} aria-hidden />
            </span>
            <p className="font-label-lg text-label-lg text-on-surface">Seret foto ke sini, atau</p>
            <Button variant="primary" className="mt-2" icon={FileImage} onClick={() => fileInputRef.current?.click()} disabled={processing}>
              Pilih foto
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              className="sr-only"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <p className="mt-2 text-body-sm text-on-surface-variant max-w-md">
              JPG/PNG. Tips: ambil 2–3 foto kelas dari sudut berbeda dan pastikan wajah menghadap kamera. Foto per orang
              (close-up) membuat pencocokan otomatis lebih akurat.
            </p>
          </div>

          {jobs.length > 0 && (
            <div className="mt-space-md rounded-xl border border-border-subtle divide-y divide-border-subtle">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-label-md font-label-md text-on-surface">
                  {processing ? "Memproses foto…" : "Selesai diproses"}
                </span>
                {processing ? (
                  <Button variant="ghost" size="sm" icon={X} onClick={() => abortRef.current?.abort()}>
                    Batalkan
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" icon={X} onClick={() => setJobs([])}>
                    Tutup
                  </Button>
                )}
              </div>
              {jobs.map((j) => (
                <div key={j.id} className="px-3 py-2">
                  <div className="flex items-center gap-2 text-body-sm">
                    {j.status === "working" ? (
                      <Loader2 size={15} className="animate-spin text-primary shrink-0" aria-hidden />
                    ) : j.status === "done" ? (
                      <CheckCircle2 size={15} className="text-confidence-high shrink-0" aria-hidden />
                    ) : j.status === "error" ? (
                      <AlertTriangle size={15} className="text-confidence-low shrink-0" aria-hidden />
                    ) : (
                      <span className="w-[15px] h-[15px] rounded-full border-2 border-outline-variant shrink-0" />
                    )}
                    <span className="flex-1 truncate text-on-surface">{j.name}</span>
                    <span className={`shrink-0 ${j.status === "error" ? "text-error" : "text-on-surface-variant"}`}>
                      {j.status === "error" ? "Gagal" : j.stage}
                    </span>
                  </div>
                  {j.status === "working" && (
                    <div className="mt-1.5 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                      <div className="h-full bg-primary-container transition-all duration-300" style={{ width: `${j.progress}%` }} />
                    </div>
                  )}
                  {j.status === "done" && j.faces === 0 && (
                    <p className="mt-1 text-body-sm text-[#b45309]">
                      Tidak ada wajah terdeteksi. Coba foto yang lebih terang/dekat, atau tandai wajah manual di Labeling.
                    </p>
                  )}
                  {j.error && <p className="mt-1 text-body-sm text-error">{j.error}</p>}
                </div>
              ))}
            </div>
          )}

          {photos.length > 0 && (
            <div className="mt-space-lg">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-label-sm font-label-sm uppercase tracking-wide text-outline">
                  Foto terunggah ({photos.length})
                </span>
                {pendingFaceCount > 0 && (
                  <Link href={`/classes/${classGroupId}/labeling`} className="text-label-md font-label-md text-primary hover:underline">
                    {pendingFaceCount} wajah menunggu nama →
                  </Link>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-space-sm">
                {photos.map((photo) => {
                  const stats = faceStats.get(photo.id) ?? { total: 0, pending: 0 };
                  const busyHere = rescanning?.photoId === photo.id;
                  return (
                    <div key={photo.id} className="group relative rounded-xl overflow-hidden bg-surface-slate border border-border-subtle aspect-[4/3]">
                      <Link href={`/classes/${classGroupId}/labeling?photo=${photo.id}`} className="block w-full h-full" title="Buka di Labeling">
                        <PhotoThumb photo={photo} className="w-full h-full" />
                      </Link>
                      <div className="absolute top-2 left-2 flex flex-wrap gap-1 pointer-events-none">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm ${
                            stats.total === 0 ? "bg-confidence-low text-white" : "bg-surface-card/95 text-on-surface"
                          }`}
                        >
                          {stats.total === 0 ? "0 wajah" : `${stats.total} wajah`}
                        </span>
                        {stats.pending > 0 && (
                          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-[#f59e0b] text-[#1f1300] shadow-sm">
                            {stats.pending} belum dinamai
                          </span>
                        )}
                      </div>
                      <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white pointer-events-none">
                        {photo.role === "portrait" ? "per orang" : "grup"}
                      </span>
                      <div className="absolute top-1.5 right-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          iconOnly
                          icon={MoreVertical}
                          onClick={() => setMenuPhotoId((id) => (id === photo.id ? null : photo.id))}
                          className="bg-surface-card/95 !h-7 !w-7"
                        >
                          Menu foto
                        </Button>
                        {menuPhotoId === photo.id && (
                          <>
                            <div className="fixed inset-0 z-20" onClick={() => setMenuPhotoId(null)} />
                            <div className="absolute right-0 mt-1 z-30 w-52 rounded-xl border border-border-subtle bg-surface-card shadow-xl p-1 text-body-md animate-fade-in">
                              <button type="button" onClick={() => handleRescan(photo)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-surface-slate text-left">
                                <ScanSearch size={15} aria-hidden /> Pindai ulang (lebih teliti)
                              </button>
                              <button type="button" onClick={() => togglePhotoRole(photo)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-surface-slate text-left">
                                <ImageIcon size={15} aria-hidden /> Tandai sbg {photo.role === "group" ? "foto per orang" : "foto grup"}
                              </button>
                              <button type="button" onClick={() => handleDeletePhoto(photo)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-error-container/60 text-error text-left">
                                <Trash2 size={15} aria-hidden /> Hapus foto
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                      {busyHere && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-surface-card/80 text-body-sm">
                          <Loader2 size={18} className="animate-spin text-primary" aria-hidden />
                          {rescanning?.label}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {!loading && (
        <StepFooterNav
          backHref={`/classes/${classGroupId}`}
          backLabel="Info Kelas"
          nextHref={`/classes/${classGroupId}/labeling`}
          nextLabel={pendingFaceCount ? `Lanjut: Pasang Nama (${pendingFaceCount} wajah)` : "Lanjut: Labeling Wajah"}
        />
      )}

      <BulkImportModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        existingNames={participants.map((p) => p.displayName)}
        onImport={async (rows) => {
          await localStore.importRoster(classGroupId, rows);
          await reload();
          notifyDataChanged();
          toast.show({ message: `${rows.length} peserta ditambahkan`, tone: "success" });
        }}
      />

      <ParticipantEditor
        open={editing !== null}
        onClose={() => setEditing(null)}
        participant={editing === "new" ? null : editing}
        classGroupId={classGroupId}
        faceUrl={editing && editing !== "new" ? faceIndex.get(editing.id)?.faceUrl : null}
        onSaved={() => reload()}
      />
    </div>
  );
}

function BulkImportModal({
  open,
  onClose,
  existingNames,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  existingNames: string[];
  onImport: (rows: ReturnType<typeof parseRoster>) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => dedupeRoster(parseRoster(text), existingNames), [text, existingNames]);

  async function apply() {
    if (parsed.fresh.length === 0) return;
    setSaving(true);
    try {
      await onImport(parsed.fresh);
      setText("");
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Tempel daftar peserta"
      description="Satu peserta per baris. Bisa langsung copy kolom dari Excel/Google Sheets: Nama · Instansi · Jabatan · Email · No. HP."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" onClick={apply} disabled={saving || parsed.fresh.length === 0}>
            {parsed.fresh.length ? `Tambahkan ${parsed.fresh.length} peserta` : "Tambahkan"}
          </Button>
        </>
      }
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        data-autofocus
        placeholder={"Rian Pratama\tDinas Kominfo\tStaf IT\nSiti Rahma, S.Kom.\tBappeda\tAnalis\nBudi Santoso"}
        className="w-full p-3 bg-surface-slate border border-border-subtle rounded-xl font-mono text-[13px] leading-6 text-on-surface focus:bg-surface-card focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/30 resize-y"
      />
      {text.trim() && (
        <div className="mt-3">
          <div className="text-label-md font-label-md text-on-surface">
            Pratinjau: {parsed.fresh.length} baru
            {parsed.duplicates.length > 0 && <span className="text-on-surface-variant"> · {parsed.duplicates.length} duplikat dilewati</span>}
          </div>
          <div className="mt-2 max-h-48 overflow-auto rounded-xl border border-border-subtle">
            <table className="w-full text-body-sm">
              <thead className="bg-surface-slate text-left text-on-surface-variant">
                <tr>
                  <th className="px-2.5 py-1.5 font-label-md">Nama</th>
                  <th className="px-2.5 py-1.5 font-label-md">Instansi</th>
                  <th className="px-2.5 py-1.5 font-label-md">Jabatan</th>
                  <th className="px-2.5 py-1.5 font-label-md">Kontak</th>
                </tr>
              </thead>
              <tbody>
                {parsed.fresh.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-t border-border-subtle">
                    <td className="px-2.5 py-1.5 text-on-surface">{r.displayName}</td>
                    <td className="px-2.5 py-1.5 text-on-surface-variant">{r.organization ?? "—"}</td>
                    <td className="px-2.5 py-1.5 text-on-surface-variant">{r.jobTitle ?? "—"}</td>
                    <td className="px-2.5 py-1.5 text-on-surface-variant">{[r.email, r.phone].filter(Boolean).join(" · ") || "—"}</td>
                  </tr>
                ))}
                {parsed.duplicates.map((r, i) => (
                  <tr key={`d${i}`} className="border-t border-border-subtle opacity-50">
                    <td className="px-2.5 py-1.5 line-through">{r.displayName}</td>
                    <td className="px-2.5 py-1.5" colSpan={3}>
                      sudah ada
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
