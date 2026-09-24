"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Calendar,
  Check,
  CheckCheck,
  ChevronDown,
  Copy,
  FileDown,
  FileText,
  Layout,
  MessageSquare,
  Plus,
  Printer,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import type { AttendanceMode, InstructorReport } from "@/domain/report";
import { formatDateIndo, formatReportText } from "@/domain/report";
import type { ClassGroup, Participant } from "@/domain/participant";
import type { SeatAssignment, SeatingDay, SeatingTable } from "@/domain/layout";
import { localStore } from "@/store/localStore";
import { notifyDataChanged } from "@/store/events";
import { Button } from "@/ui/Button";
import { useConfirm, useToast } from "@/ui/Providers";
import { StepFooterNav } from "@/features/classes/StepFooterNav";
import { ReportPrintDocument } from "./ReportPrintDocument";

export function ReportStep({ classGroupId }: { classGroupId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const printSvgRef = useRef<SVGSVGElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [classGroup, setClassGroup] = useState<ClassGroup | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [reports, setReports] = useState<InstructorReport[]>([]);
  const [currentReport, setCurrentReport] = useState<InstructorReport | null>(null);
  const [seatingDays, setSeatingDays] = useState<SeatingDay[]>([]);
  const [dayTables, setDayTables] = useState<SeatingTable[]>([]);
  const [dayAssignments, setDayAssignments] = useState<SeatAssignment[]>([]);
  const [activeTab, setActiveTab] = useState<"form" | "preview">("form");
  const [copied, setCopied] = useState(false);

  const dateInputId = useId();
  const instructorInputId = useId();
  const titleInputId = useId();
  const classInputId = useId();

  // Load initial data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cg, pList, repList, days] = await Promise.all([
        localStore.getClassGroup(classGroupId),
        localStore.listParticipants(classGroupId),
        localStore.listReports(classGroupId),
        localStore.listSeatingDays(classGroupId),
      ]);
      setClassGroup(cg ?? null);
      setParticipants(pList);
      setSeatingDays(days);

      if (repList.length > 0) {
        setReports(repList);
        setCurrentReport(repList[0]);
      } else {
        const def = await localStore.getDefaultReport(classGroupId);
        setReports([def]);
        setCurrentReport(def);
      }
    } finally {
      setLoading(false);
    }
  }, [classGroupId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load initial report data from IndexedDB
    loadData();
  }, [loadData]);

  // Load seating tables & assignments for attached room plan
  useEffect(() => {
    const targetDayId = currentReport?.seatingDayId || (seatingDays.length > 0 ? seatingDays[0].id : null);
    if (!targetDayId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset tables when no day exists
      setDayTables([]);
      setDayAssignments([]);
      return;
    }
    Promise.all([
      localStore.listSeatingTables(targetDayId),
      localStore.listSeatAssignments(targetDayId),
    ]).then(([tables, assignments]) => {
      setDayTables(tables);
      setDayAssignments(assignments);
    });
  }, [currentReport?.seatingDayId, seatingDays]);

  // Auto-save report on state updates (debounced)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateReport = useCallback(
    (patch: Partial<InstructorReport>) => {
      setCurrentReport((prev) => {
        if (!prev) return null;
        const updated = { ...prev, ...patch, updatedAt: new Date().toISOString() };
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(async () => {
          await localStore.saveReport(updated);
          setReports((list) => list.map((r) => (r.id === updated.id ? updated : r)));
          notifyDataChanged();
        }, 300);
        return updated;
      });
    },
    []
  );

  // When instructor name changes, remember in localStorage and sync title if default
  function handleInstructorNameChange(newName: string) {
    if (typeof window !== "undefined") {
      localStorage.setItem("anomia:instructor-name", newName);
    }
    const currentTitle = currentReport?.title || "";
    const prevName = currentReport?.instructorName || "";
    const defaultPrevTitle = `${prevName} - PELAPORAN HARIAN INSTRUKTUR`;

    const newTitle =
      !currentTitle || currentTitle === defaultPrevTitle
        ? `${newName} - PELAPORAN HARIAN INSTRUKTUR`
        : currentTitle;

    updateReport({ instructorName: newName, title: newTitle });
  }

  // Create a new report
  async function handleCreateNewReport() {
    const defaultName =
      typeof window !== "undefined"
        ? localStorage.getItem("anomia:instructor-name") || "YAQ"
        : "YAQ";
    const today = new Date().toISOString().slice(0, 10);
    const sortedDays = [...seatingDays].sort((a, b) => a.order - b.order);

    const newRep: InstructorReport = {
      id: crypto.randomUUID ? crypto.randomUUID() : `rep_${Date.now()}`,
      classGroupId,
      instructorName: defaultName,
      title: `${defaultName} - PELAPORAN HARIAN INSTRUKTUR`,
      className: classGroup?.name ?? "",
      date: today,
      attendancePresent: participants.length,
      attendanceTotal: participants.length,
      attendanceMode: "offline",
      presentParticipantIds: participants.map((p) => p.id),
      absentParticipantIds: [],
      materialProgress: "",
      classCondition: "aktif",
      wagIssue: "Terespon.",
      teamInfo: "-",
      includeSeatingPlan: sortedDays.length > 0,
      seatingDayId: sortedDays.length > 0 ? sortedDays[0].id : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await localStore.saveReport(newRep);
    setReports((prev) => [newRep, ...prev]);
    setCurrentReport(newRep);
    toast.show({ message: "Laporan baru dibuat", tone: "success" });
    notifyDataChanged();
  }

  // Delete current report
  async function handleDeleteReport() {
    if (!currentReport) return;
    const ok = await confirm({
      title: "Hapus laporan ini?",
      message: `Laporan "${currentReport.title}" (${formatDateIndo(currentReport.date)}) akan dihapus.`,
      confirmLabel: "Hapus",
      tone: "danger",
    });
    if (!ok) return;

    await localStore.deleteReport(currentReport.id);
    const remaining = reports.filter((r) => r.id !== currentReport.id);
    setReports(remaining);
    if (remaining.length > 0) {
      setCurrentReport(remaining[0]);
    } else {
      const def = await localStore.getDefaultReport(classGroupId);
      setReports([def]);
      setCurrentReport(def);
    }
    toast.show({ message: "Laporan dihapus", tone: "default" });
    notifyDataChanged();
  }

  // Copy report in WhatsApp format
  async function handleCopyReport() {
    if (!currentReport) return;
    const text = formatReportText(currentReport);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.show({
        message: "Format laporan berhasil disalin! Siap ditempel ke WhatsApp.",
        tone: "success",
      });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.show({ message: "Gagal menyalin ke clipboard", tone: "error" });
    }
  }

  // Print / Export PDF
  function handlePrint() {
    window.print();
  }

  // Attendance helpers
  function toggleParticipantAttendance(participantId: string) {
    if (!currentReport) return;
    const presentList = currentReport.presentParticipantIds ?? participants.map((p) => p.id);
    const isPresent = presentList.includes(participantId);

    const updatedPresent = isPresent
      ? presentList.filter((id) => id !== participantId)
      : [...presentList, participantId];

    const absentList = participants
      .filter((p) => !updatedPresent.includes(p.id))
      .map((p) => p.id);

    updateReport({
      presentParticipantIds: updatedPresent,
      absentParticipantIds: absentList,
      attendancePresent: updatedPresent.length,
      attendanceTotal: participants.length,
    });
  }

  function setAllAttendance(allPresent: boolean) {
    if (!currentReport) return;
    const presentIds = allPresent ? participants.map((p) => p.id) : [];
    const absentIds = allPresent ? [] : participants.map((p) => p.id);
    updateReport({
      presentParticipantIds: presentIds,
      absentParticipantIds: absentIds,
      attendancePresent: presentIds.length,
      attendanceTotal: participants.length,
    });
  }

  if (loading || !currentReport) {
    return (
      <div className="w-full max-w-7xl mx-auto p-8 animate-pulse">
        <div className="h-10 bg-surface-container-low rounded-xl w-64 mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 h-96 bg-surface-card rounded-2xl border border-border-subtle" />
          <div className="lg:col-span-5 h-96 bg-surface-card rounded-2xl border border-border-subtle" />
        </div>
      </div>
    );
  }

  const activeSeatingDay = seatingDays.find((d) => d.id === currentReport.seatingDayId) || seatingDays[0];

  return (
    <div className="w-full max-w-7xl mx-auto px-layout-gutter-mobile md:px-layout-gutter-desktop py-space-lg md:py-space-xl">
      {/* Dynamic print stylesheet for report PDF */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
          .print-report-container {
            display: block !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>

      {/* Screen layout (hidden in print) */}
      <div className="no-print space-y-space-lg">
        {/* Top Action Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-primary-container text-on-primary">
                <FileText size={20} />
              </span>
              <h1 className="text-title-lg font-title-lg text-on-surface">Pelaporan Harian Instruktur</h1>
            </div>
            <p className="text-body-sm text-on-surface-variant mt-1">
              Buat, ekspor PDF, atau salin teks laporan harian untuk WhatsApp dan arsip tim training.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {reports.length > 1 && (
              <div className="relative inline-block">
                <select
                  value={currentReport.id}
                  onChange={(e) => {
                    const selected = reports.find((r) => r.id === e.target.value);
                    if (selected) setCurrentReport(selected);
                  }}
                  className="h-10 pl-3 pr-8 rounded-lg bg-surface-card border border-border-subtle text-label-md font-label-md text-on-surface appearance-none focus:outline-none focus:ring-2 focus:ring-border-focus cursor-pointer"
                >
                  {reports.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} ({formatDateIndo(r.date)})
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-3 pointer-events-none text-on-surface-variant" />
              </div>
            )}

            <Button
              variant="secondary"
              size="md"
              icon={Plus}
              onClick={handleCreateNewReport}
              title="Buat laporan sesi/hari lain"
            >
              Laporan Baru
            </Button>

            <Button
              variant="secondary"
              size="md"
              icon={copied ? Check : Copy}
              onClick={handleCopyReport}
              className={copied ? "text-confidence-high border-confidence-high/40" : ""}
            >
              {copied ? "Tersalin!" : "Salin Format WA"}
            </Button>

            <Button
              variant="primary"
              size="md"
              icon={Printer}
              onClick={handlePrint}
            >
              Cetak / Export PDF
            </Button>

            {reports.length > 1 && (
              <Button
                variant="dangerGhost"
                size="md"
                icon={Trash2}
                onClick={handleDeleteReport}
                iconOnly
                title="Hapus laporan ini"
              >
                Hapus
              </Button>
            )}
          </div>
        </div>

        {/* Tab switch for mobile */}
        <div className="flex lg:hidden rounded-xl bg-surface-slate p-1 border border-border-subtle">
          <button
            type="button"
            onClick={() => setActiveTab("form")}
            className={`flex-1 py-2 text-label-md font-label-md rounded-lg transition-colors ${
              activeTab === "form" ? "bg-surface-card text-on-surface shadow-xs" : "text-on-surface-variant"
            }`}
          >
            Formulir Input
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("preview")}
            className={`flex-1 py-2 text-label-md font-label-md rounded-lg transition-colors ${
              activeTab === "preview" ? "bg-surface-card text-on-surface shadow-xs" : "text-on-surface-variant"
            }`}
          >
            Pratinjau Dokumen
          </button>
        </div>

        {/* Main Grid: Form Left, Preview Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
          {/* Left Column: Form Editor */}
          <div
            className={`lg:col-span-7 space-y-space-md ${
              activeTab === "preview" ? "hidden lg:block" : "block"
            }`}
          >
            {/* Box 1: Info Dasar */}
            <div className="bg-surface-card border border-border-subtle rounded-2xl p-space-lg space-y-space-md shadow-xs">
              <h2 className="text-title-sm font-title-sm text-on-surface flex items-center gap-2">
                <Calendar size={18} className="text-primary" />
                Informasi Pelaporan
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                <div>
                  <label htmlFor={instructorInputId} className="block text-label-md font-label-md text-on-surface mb-1">
                    Nama Instruktur
                  </label>
                  <input
                    id={instructorInputId}
                    type="text"
                    value={currentReport.instructorName}
                    onChange={(e) => handleInstructorNameChange(e.target.value)}
                    placeholder="mis. YAQ"
                    className="w-full h-10 px-3 rounded-lg bg-surface-slate border border-border-subtle text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-border-focus"
                  />
                  <p className="text-[11px] text-on-surface-variant mt-1">Disimpan otomatis untuk laporan berikutnya.</p>
                </div>

                <div>
                  <label htmlFor={dateInputId} className="block text-label-md font-label-md text-on-surface mb-1">
                    Tanggal Pelaporan
                  </label>
                  <input
                    id={dateInputId}
                    type="date"
                    value={currentReport.date}
                    onChange={(e) => updateReport({ date: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg bg-surface-slate border border-border-subtle text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-border-focus"
                  />
                  <p className="text-[11px] text-on-surface-variant mt-1">Format laporan: {formatDateIndo(currentReport.date)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md pt-2">
                <div>
                  <label htmlFor={classInputId} className="block text-label-md font-label-md text-on-surface mb-1">
                    Nama Kelas
                  </label>
                  <input
                    id={classInputId}
                    type="text"
                    value={currentReport.className}
                    onChange={(e) => updateReport({ className: e.target.value })}
                    placeholder="Nama kelas"
                    className="w-full h-10 px-3 rounded-lg bg-surface-slate border border-border-subtle text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-border-focus"
                  />
                </div>

                <div>
                  <label htmlFor={titleInputId} className="block text-label-md font-label-md text-on-surface mb-1">
                    Judul Laporan
                  </label>
                  <input
                    id={titleInputId}
                    type="text"
                    value={currentReport.title}
                    onChange={(e) => updateReport({ title: e.target.value })}
                    placeholder="mis. YAQ - PELAPORAN HARIAN INSTRUKTUR"
                    className="w-full h-10 px-3 rounded-lg bg-surface-slate border border-border-subtle text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-border-focus"
                  />
                </div>
              </div>
            </div>

            {/* Box 2: Kehadiran Peserta */}
            <div className="bg-surface-card border border-border-subtle rounded-2xl p-space-lg space-y-space-md shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h2 className="text-title-sm font-title-sm text-on-surface flex items-center gap-2">
                  <Users size={18} className="text-primary" />
                  1. Kehadiran Peserta
                </h2>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAllAttendance(true)}
                    className="text-label-sm font-label-sm text-primary hover:underline px-2 py-1 rounded"
                  >
                    Semua Hadir
                  </button>
                  <span className="text-outline-variant">·</span>
                  <button
                    type="button"
                    onClick={() => setAllAttendance(false)}
                    className="text-label-sm font-label-sm text-on-surface-variant hover:underline px-2 py-1 rounded"
                  >
                    Kosongkan
                  </button>
                </div>
              </div>

              {/* Attendance Mode Buttons */}
              <div>
                <label className="block text-label-sm font-label-sm text-on-surface-variant mb-1.5">
                  Mode Pelaksanaan:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["offline", "online", "hybrid"] as AttendanceMode[]).map((mode) => {
                    const active = currentReport.attendanceMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updateReport({ attendanceMode: mode })}
                        className={`h-9 rounded-lg font-label-md text-label-md capitalize transition-colors border ${
                          active
                            ? "bg-primary-container text-on-primary border-primary font-bold shadow-xs"
                            : "bg-surface-slate text-on-surface border-border-subtle hover:bg-surface-container"
                        }`}
                      >
                        {mode}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Attendance Numbers */}
              <div className="p-3 bg-surface-slate rounded-xl border border-border-subtle flex items-center justify-between">
                <div>
                  <p className="text-body-sm text-on-surface-variant">Status Ringkasan Kehadiran:</p>
                  <p className="font-label-lg text-label-lg text-on-surface mt-0.5">
                    Hadir:{" "}
                    <span className="font-bold text-primary">{currentReport.attendancePresent}</span> dari{" "}
                    <span className="font-bold">{currentReport.attendanceTotal}</span> peserta hadir secara{" "}
                    <span className="underline font-semibold">{currentReport.attendanceMode}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="text-[11px] text-on-surface-variant block">Jumlah Hadir</span>
                    <input
                      type="number"
                      min={0}
                      max={currentReport.attendanceTotal || 999}
                      value={currentReport.attendancePresent}
                      onChange={(e) =>
                        updateReport({ attendancePresent: Math.max(0, parseInt(e.target.value) || 0) })
                      }
                      className="w-16 h-8 px-2 text-center rounded border border-border-subtle bg-surface-card text-label-lg font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Participant Checklist */}
              {participants.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="text-label-sm font-label-sm text-on-surface-variant">
                    Daftar Peserta ({currentReport.attendancePresent}/{participants.length} hadir):
                  </p>
                  <div className="max-h-56 overflow-y-auto scroll-thin rounded-xl border border-border-subtle divide-y divide-border-subtle">
                    {participants.map((p) => {
                      const presentList = currentReport.presentParticipantIds ?? participants.map((x) => x.id);
                      const isPresent = presentList.includes(p.id);
                      return (
                        <div
                          key={p.id}
                          onClick={() => toggleParticipantAttendance(p.id)}
                          className={`flex items-center justify-between p-2.5 cursor-pointer transition-colors ${
                            isPresent ? "bg-surface-card hover:bg-surface-slate" : "bg-error-container/20 hover:bg-error-container/30"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-5 h-5 rounded flex items-center justify-center border text-white transition-colors shrink-0 ${
                                isPresent ? "bg-confidence-high border-confidence-high" : "border-outline-variant bg-surface-card"
                              }`}
                            >
                              {isPresent && <Check size={14} strokeWidth={3} />}
                            </span>
                            <div className="min-w-0">
                              <p className={`font-label-md text-label-md truncate ${isPresent ? "text-on-surface" : "text-on-surface-variant line-through"}`}>
                                {p.displayName}
                              </p>
                              {p.organization && (
                                <p className="text-body-sm text-on-surface-variant truncate">
                                  {p.organization} {p.jobTitle ? `· ${p.jobTitle}` : ""}
                                </p>
                              )}
                            </div>
                          </div>
                          <span
                            className={`text-label-sm font-label-sm px-2 py-0.5 rounded-full shrink-0 ${
                              isPresent ? "bg-confidence-high/10 text-confidence-high" : "bg-error-container text-error"
                            }`}
                          >
                            {isPresent ? "Hadir" : "Absen"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Box 3: Progres Materi */}
            <div className="bg-surface-card border border-border-subtle rounded-2xl p-space-lg space-y-space-md shadow-xs">
              <h2 className="text-title-sm font-title-sm text-on-surface flex items-center gap-2">
                <FileDown size={18} className="text-primary" />
                2. Progres Materi
              </h2>
              <div>
                <label className="block text-label-md font-label-md text-on-surface mb-1">
                  Event hari ini / Topik Pembahasan:
                </label>
                <textarea
                  rows={2}
                  value={currentReport.materialProgress}
                  onChange={(e) => updateReport({ materialProgress: e.target.value })}
                  placeholder="mis. Tableau Prep Builder, Cleansing Data & Automasi Alur Kerja"
                  className="w-full p-3 rounded-lg bg-surface-slate border border-border-subtle text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-border-focus"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[11px] text-on-surface-variant self-center mr-1">Rekomendasi cepat:</span>
                  {[
                    "Tableau Prep Builder",
                    "Pengenalan & Teori Dasar",
                    "Praktik Lab & Hands-on",
                    "Studi Kasus & Evaluasi Mandiri",
                    "Pemaparan Project & Feedback",
                  ].map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => updateReport({ materialProgress: sug })}
                      className="text-label-sm font-label-sm px-2 py-0.5 rounded-md bg-surface-slate border border-border-subtle hover:bg-surface-container text-on-surface"
                    >
                      + {sug}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Box 4: Kondisi Kelas */}
            <div className="bg-surface-card border border-border-subtle rounded-2xl p-space-lg space-y-space-md shadow-xs">
              <h2 className="text-title-sm font-title-sm text-on-surface flex items-center gap-2">
                <Sparkles size={18} className="text-primary" />
                3. Kondisi Kelas
              </h2>
              <div>
                <label className="block text-label-md font-label-md text-on-surface mb-1">
                  Dinamika peserta:
                </label>
                <input
                  type="text"
                  value={currentReport.classCondition}
                  onChange={(e) => updateReport({ classCondition: e.target.value })}
                  placeholder="mis. aktif"
                  className="w-full h-10 px-3 rounded-lg bg-surface-slate border border-border-subtle text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-border-focus"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[11px] text-on-surface-variant self-center mr-1">Rekomendasi cepat:</span>
                  {[
                    "aktif",
                    "sangat aktif dan interaktif",
                    "kondusif dan fokus",
                    "antusias dalam diskusi & tanya jawab",
                    "membutuhkan pendampingan personal",
                  ].map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => updateReport({ classCondition: sug })}
                      className="text-label-sm font-label-sm px-2 py-0.5 rounded-md bg-surface-slate border border-border-subtle hover:bg-surface-container text-on-surface"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Box 5: Isu WAG & Info Tim */}
            <div className="bg-surface-card border border-border-subtle rounded-2xl p-space-lg space-y-space-md shadow-xs">
              <div className="space-y-space-md">
                <div>
                  <h2 className="text-title-sm font-title-sm text-on-surface flex items-center gap-2 mb-2">
                    <MessageSquare size={18} className="text-primary" />
                    4. Isu WAG Kelas
                  </h2>
                  <label className="block text-label-md font-label-md text-on-surface mb-1">
                    Semua isu terrespons:
                  </label>
                  <input
                    type="text"
                    value={currentReport.wagIssue}
                    onChange={(e) => updateReport({ wagIssue: e.target.value })}
                    placeholder="mis. Terespon."
                    className="w-full h-10 px-3 rounded-lg bg-surface-slate border border-border-subtle text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-border-focus"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {["Terespon.", "Semua isu terrespons baik.", "Tidak ada isu kendala di WAG."].map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => updateReport({ wagIssue: sug })}
                        className="text-label-sm font-label-sm px-2 py-0.5 rounded-md bg-surface-slate border border-border-subtle hover:bg-surface-container text-on-surface"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-border-subtle">
                  <h2 className="text-title-sm font-title-sm text-on-surface flex items-center gap-2 mb-2">
                    <UserCheck size={18} className="text-primary" />
                    5. Info Untuk Tim
                  </h2>
                  <textarea
                    rows={2}
                    value={currentReport.teamInfo}
                    onChange={(e) => updateReport({ teamInfo: e.target.value })}
                    placeholder="mis. - atau info fasilitas/kendala untuk tim operasional"
                    className="w-full p-3 rounded-lg bg-surface-slate border border-border-subtle text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-border-focus"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {["-", "Kebutuhan ruangan dan konsumsi aman.", "Sesi besok dimulai tepat waktu jam 09.00."].map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => updateReport({ teamInfo: sug })}
                        className="text-label-sm font-label-sm px-2 py-0.5 rounded-md bg-surface-slate border border-border-subtle hover:bg-surface-container text-on-surface"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Box 6: Lampiran Denah Ruangan (Opsional) */}
            {seatingDays.length > 0 && (
              <div className="bg-surface-card border border-border-subtle rounded-2xl p-space-lg space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layout size={18} className="text-primary" />
                    <div>
                      <h3 className="font-label-lg text-label-lg text-on-surface">Lampiran Denah Ruangan</h3>
                      <p className="text-body-sm text-on-surface-variant">
                        Sertakan denah posisi duduk peserta pada halaman lampiran PDF.
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(currentReport.includeSeatingPlan)}
                    onChange={(e) => updateReport({ includeSeatingPlan: e.target.checked })}
                    className="w-5 h-5 rounded text-primary focus:ring-primary cursor-pointer"
                  />
                </div>

                {currentReport.includeSeatingPlan && seatingDays.length > 1 && (
                  <div className="pt-2 flex items-center gap-2">
                    <label className="text-label-sm font-label-sm text-on-surface-variant">Pilih Sesi Denah:</label>
                    <select
                      value={currentReport.seatingDayId || seatingDays[0].id}
                      onChange={(e) => updateReport({ seatingDayId: e.target.value })}
                      className="h-8 px-2 rounded-lg bg-surface-slate border border-border-subtle text-label-sm font-label-sm"
                    >
                      {seatingDays.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Live Document Preview */}
          <div
            className={`lg:col-span-5 sticky top-24 space-y-space-md ${
              activeTab === "form" ? "hidden lg:block" : "block"
            }`}
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-label-md font-label-md text-on-surface-variant flex items-center gap-1.5">
                <FileText size={16} /> Pratinjau Teks & PDF
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon={copied ? CheckCheck : Copy}
                onClick={handleCopyReport}
              >
                {copied ? "Tersalin!" : "Salin Format WA"}
              </Button>
            </div>

            {/* WhatsApp formatted card preview */}
            <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 shadow-sm font-mono text-sm leading-relaxed text-on-surface whitespace-pre-wrap select-all overflow-x-auto">
              {formatReportText(currentReport)}
            </div>

            {/* Document Stationery visual preview */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 font-sans text-slate-800">
              <div className="border-b border-slate-300 pb-3 flex justify-between items-start">
                <div>
                  <p className="text-[10px] tracking-wider uppercase font-bold text-slate-500">
                    ANOMIA · LAPORAN HARIAN
                  </p>
                  <p className="font-bold text-slate-900 text-base">{currentReport.title}</p>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 bg-slate-200 text-slate-700 rounded uppercase">
                  {currentReport.attendanceMode}
                </span>
              </div>

              <div className="space-y-1 text-xs">
                <p>
                  <strong className="text-slate-600">Kelas :</strong> {currentReport.className}
                </p>
                <p>
                  <strong className="text-slate-600">Tanggal :</strong> {formatDateIndo(currentReport.date)}
                </p>
              </div>

              <div className="space-y-2.5 text-xs pt-1">
                <div className="p-2.5 bg-white rounded border border-slate-200">
                  <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">1. KEHADIRAN PESERTA</p>
                  <p className="mt-1">
                    Hadir : {currentReport.attendancePresent} dari {currentReport.attendanceTotal} peserta hadir secara{" "}
                    {currentReport.attendanceMode}
                  </p>
                </div>

                <div className="p-2.5 bg-white rounded border border-slate-200">
                  <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">2. PROGRES MATERI</p>
                  <p className="mt-1 whitespace-pre-wrap">Event hari ini : {currentReport.materialProgress || "-"}</p>
                </div>

                <div className="p-2.5 bg-white rounded border border-slate-200">
                  <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">3. KONDISI KELAS</p>
                  <p className="mt-1 whitespace-pre-wrap">Dinamika peserta : {currentReport.classCondition || "-"}</p>
                </div>

                <div className="p-2.5 bg-white rounded border border-slate-200">
                  <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">4. ISU WAG KELAS</p>
                  <p className="mt-1 whitespace-pre-wrap">Semua isu terrespons : {currentReport.wagIssue || "Terespon."}</p>
                </div>

                <div className="p-2.5 bg-white rounded border border-slate-200">
                  <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">5. INFO UNTUK TIM</p>
                  <p className="mt-1 whitespace-pre-wrap">{currentReport.teamInfo || "-"}</p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-between items-center text-[11px] text-slate-500">
                <span>Instruktur: {currentReport.instructorName}</span>
                <span className="font-semibold text-primary">Siap Dicetak ke PDF</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Navigation */}
        <StepFooterNav
          backHref={`/classes/${classGroupId}/seating`}
          backLabel="Denah Ruangan"
          nextHref="/"
          nextLabel="Selesai & Ke Beranda"
          hint="Laporan tersimpan otomatis di browser ini."
        />
      </div>

      {/* Print Document (rendered only on window.print()) */}
      <ReportPrintDocument
        report={currentReport}
        participants={participants}
        printSvgRef={printSvgRef}
        seatingTables={dayTables}
        seatAssignments={dayAssignments}
        roomWidth={activeSeatingDay?.roomWidth || 800}
        roomDepth={activeSeatingDay?.roomDepth || 600}
        dayLabel={activeSeatingDay?.label}
        instructorPosition={activeSeatingDay?.instructorPosition}
        instructorX={activeSeatingDay?.instructorX}
        instructorY={activeSeatingDay?.instructorY}
        instructorLabel={activeSeatingDay?.instructorLabel}
      />
    </div>
  );
}
