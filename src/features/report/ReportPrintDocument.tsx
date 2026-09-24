"use client";

import React from "react";
import type { InstructorReport } from "@/domain/report";
import { formatDateIndo } from "@/domain/report";
import type { Participant } from "@/domain/participant";
import type { SeatingTable, SeatAssignment } from "@/domain/layout";
import { RoomPlan } from "@/features/seating/RoomPlan";

import type { SeatOccupant } from "@/features/seating/RoomPlan";

interface ReportPrintDocumentProps {
  report: InstructorReport;
  participants: Participant[];
  printSvgRef?: React.RefObject<SVGSVGElement | null>;
  seatingTables?: SeatingTable[];
  seatAssignments?: SeatAssignment[];
  roomWidth?: number;
  roomDepth?: number;
  dayLabel?: string;
}

export function ReportPrintDocument({
  report,
  participants,
  printSvgRef,
  seatingTables = [],
  seatAssignments = [],
  roomWidth = 800,
  roomDepth = 600,
  dayLabel,
}: ReportPrintDocumentProps) {
  const formattedDate = formatDateIndo(report.date);
  const modeLabel =
    report.attendanceMode === "online"
      ? "online"
      : report.attendanceMode === "hybrid"
        ? "hybrid"
        : "offline";

  const presentSet = new Set(report.presentParticipantIds ?? []);
  const hasParticipantList = report.presentParticipantIds && report.presentParticipantIds.length > 0;

  const occupants = new Map<string, SeatOccupant>();
  if (report.includeSeatingPlan && seatingTables.length > 0) {
    const participantMap = new Map(participants.map((p) => [p.id, p]));
    for (const a of seatAssignments) {
      const p = participantMap.get(a.participantId);
      if (p) occupants.set(`${a.seatingTableId}:${a.seatIndex}`, { participant: p, faceUrl: null });
    }
  }

  return (
    <div className="print-only print-report-container font-sans text-slate-900 bg-white p-8 max-w-[210mm] mx-auto">
      {/* Page 1: Laporan Utama */}
      <div className="min-h-[265mm] flex flex-col justify-between border-b-0 pb-6 print:pb-0">
        <div>
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-4 mb-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] tracking-widest uppercase font-bold text-slate-500 mb-1">
                  ANOMIA · SISTEM MANAJEMEN KELAS & PELAPORAN
                </p>
                <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                  {report.title || `${report.instructorName} - PELAPORAN HARIAN INSTRUKTUR`}
                </h1>
              </div>
              <div className="text-right shrink-0">
                <span className="inline-block px-2.5 py-1 bg-slate-100 rounded text-xs font-semibold text-slate-700 uppercase">
                  Mode: {modeLabel}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4 pt-3 border-t border-slate-200 text-sm">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-slate-600 w-20 shrink-0">Kelas</span>
                <span className="font-bold text-slate-900">: {report.className}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-slate-600 w-20 shrink-0">Tanggal</span>
                <span className="font-bold text-slate-900">: {formattedDate}</span>
              </div>
            </div>
          </div>

          {/* Sections matching user specifications */}
          <div className="space-y-5 text-sm">
            {/* 1. Kehadiran */}
            <section className="bg-slate-50/60 p-4 rounded-lg border border-slate-200">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 text-white text-[11px] font-bold">
                  1
                </span>
                KEHADIRAN PESERTA
              </h2>
              <div className="pl-6 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-slate-600 w-16">Hadir</span>
                  <span className="font-medium text-slate-900">
                    : <strong className="font-bold">{report.attendancePresent}</strong> dari{" "}
                    <strong className="font-bold">{report.attendanceTotal}</strong> peserta hadir secara{" "}
                    <span className="font-semibold underline decoration-slate-400">{modeLabel}</span>
                  </span>
                </div>
              </div>
            </section>

            {/* 2. Progres Materi */}
            <section className="bg-slate-50/60 p-4 rounded-lg border border-slate-200">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 text-white text-[11px] font-bold">
                  2
                </span>
                PROGRES MATERI
              </h2>
              <div className="pl-6 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-slate-600 w-28 shrink-0">Event hari ini</span>
                  <span className="font-medium text-slate-900 whitespace-pre-wrap">
                    : {report.materialProgress || "-"}
                  </span>
                </div>
              </div>
            </section>

            {/* 3. Kondisi Kelas */}
            <section className="bg-slate-50/60 p-4 rounded-lg border border-slate-200">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 text-white text-[11px] font-bold">
                  3
                </span>
                KONDISI KELAS
              </h2>
              <div className="pl-6 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-slate-600 w-32 shrink-0">Dinamika peserta</span>
                  <span className="font-medium text-slate-900 whitespace-pre-wrap">
                    : {report.classCondition || "-"}
                  </span>
                </div>
              </div>
            </section>

            {/* 4. Isu WAG Kelas */}
            <section className="bg-slate-50/60 p-4 rounded-lg border border-slate-200">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 text-white text-[11px] font-bold">
                  4
                </span>
                ISU WAG KELAS
              </h2>
              <div className="pl-6 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-slate-600 w-36 shrink-0">Semua isu terrespons</span>
                  <span className="font-medium text-slate-900 whitespace-pre-wrap">
                    : {report.wagIssue || "Terespon."}
                  </span>
                </div>
              </div>
            </section>

            {/* 5. Info Untuk Tim */}
            <section className="bg-slate-50/60 p-4 rounded-lg border border-slate-200">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 text-white text-[11px] font-bold">
                  5
                </span>
                INFO UNTUK TIM
              </h2>
              <div className="pl-6 text-sm">
                <p className="font-medium text-slate-900 whitespace-pre-wrap">
                  {report.teamInfo || "-"}
                </p>
              </div>
            </section>

            {/* Participant Attendance Summary Table (if participants present) */}
            {hasParticipantList && (
              <section className="mt-4 pt-3 border-t border-slate-200">
                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Rincian Kehadiran Peserta:
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {participants.map((p, idx) => {
                    const isPresent = presentSet.has(p.id);
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between py-1 px-2 rounded ${
                          isPresent ? "bg-slate-50" : "bg-red-50 text-red-700"
                        }`}
                      >
                        <span className="truncate">
                          {idx + 1}. {p.displayName} {p.organization ? `(${p.organization})` : ""}
                        </span>
                        <span className="font-bold text-[10px] ml-2 shrink-0">
                          {isPresent ? "HADIR" : "TIDAK HADIR"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Footer / Signature area */}
        <div className="mt-8 pt-4 border-t border-slate-300 flex items-end justify-between text-xs text-slate-500">
          <div>
            <p>Dicetak otomatis melalui Anomia Seating & Reporting</p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Waktu: {new Date().toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-slate-600 mb-8 font-medium">Instruktur,</p>
            <p className="font-bold text-slate-900 text-sm underline">{report.instructorName}</p>
          </div>
        </div>
      </div>

      {/* Page 2: Denah Ruangan (if enabled) */}
      {report.includeSeatingPlan && seatingTables.length > 0 && (
        <div className="break-before-page pt-8">
          <div className="border-b-2 border-slate-900 pb-3 mb-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] tracking-widest uppercase font-bold text-slate-500">
                LAMPIRAN DENAH RUANGAN
              </p>
              <h2 className="text-base font-bold text-slate-900">
                {report.className} {dayLabel ? `· ${dayLabel}` : ""}
              </h2>
            </div>
            <p className="text-xs text-slate-500">Tanggal: {formattedDate}</p>
          </div>

          <div className="w-full flex items-center justify-center">
            <RoomPlan
              svgRef={printSvgRef}
              roomWidth={roomWidth}
              roomDepth={roomDepth}
              tables={seatingTables}
              occupants={occupants}
              mode="export"
              labelMode="name"
              header={{
                title: report.className,
                subtitle: `Denah Tempat Duduk Peserta (${dayLabel || "Sesi"})`,
                meta: `Instruktur: ${report.instructorName} · ${formattedDate}`,
              }}
              style={{ ["--rp-font" as string]: "var(--font-inter)" } as React.CSSProperties}
            />
          </div>
        </div>
      )}
    </div>
  );
}
