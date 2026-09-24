export type TableLayoutTemplate =
  | "banquet"
  | "classroom"
  | "conference"
  | "hollow-square"
  | "theater"
  | "ushape"
  | "custom";

/**
 * Bentuk meja di denah ruangan.
 * - round  : meja bundar, kursi mengelilingi
 * - rect   : meja panjang, kursi di kedua sisi panjang (+ ujung)
 * - row    : meja panjang, kursi hanya di satu sisi (classroom, lengan U-shape, sisi hollow square)
 * - chairs : deretan kursi tanpa meja (theater)
 */
export type TableShape = "round" | "rect" | "row" | "chairs";

export type InstructorPlacement = "top" | "bottom" | "custom";

export interface SeatingDay {
  id: string;
  classGroupId: string;
  label: string;
  order: number;
  layoutTemplate: TableLayoutTemplate;
  locked: boolean;
  /** lebar ruangan dalam cm (sumbu x, sejajar layar/depan kelas) */
  roomWidth?: number;
  /** kedalaman ruangan dalam cm (sumbu y, dari depan ke belakang) */
  roomDepth?: number;
  /** Posisi instruktur & layar: "top" (default di atas), "bottom" (di bawah), atau "custom" */
  instructorPosition?: InstructorPlacement;
  /** Koordinat titik tengah area instruktur */
  instructorX?: number;
  instructorY?: number;
  /** Label khusus jika ingin diubah (default: "Instruktur") */
  instructorLabel?: string;
  createdAt: string;
}

export interface SeatingTable {
  id: string;
  seatingDayId: string;
  name: string;
  seatCount: number;
  order: number;
  shape?: TableShape;
  /** posisi titik tengah meja di ruangan, dalam cm. */
  x?: number;
  y?: number;
  /** rotasi dalam derajat, searah jarum jam */
  rotation?: number;
}

export interface SeatAssignment {
  id: string;
  seatingTableId: string;
  seatIndex: number;
  participantId: string;
}
