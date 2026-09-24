export type AttendanceMode = "offline" | "online" | "hybrid";

export interface InstructorReport {
  id: string;
  classGroupId: string;
  instructorName: string;
  title: string;
  className: string;
  date: string; // YYYY-MM-DD
  attendancePresent: number;
  attendanceTotal: number;
  attendanceMode: AttendanceMode;
  presentParticipantIds?: string[];
  absentParticipantIds?: string[];
  materialProgress: string;
  classCondition: string;
  wagIssue: string;
  teamInfo: string;
  includeSeatingPlan?: boolean;
  seatingDayId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Formats date from YYYY-MM-DD to DD/MM/YYYY */
export function formatDateIndo(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/** Generates standard WhatsApp / plain-text report matching instructor guidelines */
export function formatReportText(report: InstructorReport): string {
  const formattedDate = formatDateIndo(report.date);
  const modeText =
    report.attendanceMode === "online"
      ? "online"
      : report.attendanceMode === "hybrid"
        ? "hybrid"
        : "offline";

  return `${report.title.trim()}

Kelas\t: ${report.className.trim()}
Tanggal\t: ${formattedDate}
1. KEHADIRAN PESERTA
Hadir\t: ${report.attendancePresent} dari ${report.attendanceTotal} peserta hadir secara ${modeText}

2. PROGRES MATERI
Event hari ini\t: ${report.materialProgress.trim()}

3. KONDISI KELAS
Dinamika peserta\t: ${report.classCondition.trim()}

4. ISU WAG KELAS
Semua isu terrespons\t: ${report.wagIssue.trim()}

5. INFO UNTUK TIM
${report.teamInfo.trim() || "-"}`;
}
