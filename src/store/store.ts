import type { ClassGroup, Participant, ParticipantDetails } from "@/domain/participant";
import type {
  DetectedFace,
  DetectedFaceStatus,
  FaceEmbedding,
  ImageAsset,
  Photo,
  PhotoRole,
} from "@/domain/face";
import type { SeatAssignment, SeatingDay, SeatingTable, TableLayoutTemplate } from "@/domain/layout";
import type { InstructorReport } from "@/domain/report";

export type RosterRow = { displayName: string } & Partial<Omit<ParticipantDetails, "displayName">>;

export interface NewFaceInput {
  face: Omit<DetectedFace, "id" | "photoId" | "classGroupId" | "createdAt">;
  /** null/empty when the embedding model could not describe this face (e.g. manual box) */
  embedding: number[] | null;
  modelName: string;
  modelVersion: string;
}

export interface FaceState {
  id: string;
  status: DetectedFaceStatus;
  participantId: string | null;
}

export type TableDraft = Omit<SeatingTable, "id" | "seatingDayId" | "order"> & { order?: number };

export type AutoAssignStrategy = "order" | "random" | "mix-org";

export type NewDayMode = "copy" | "shuffle" | "empty";

export interface ClassStats {
  participants: number;
  photos: number;
  faces: number;
  labeledFaces: number;
  participantsWithFace: number;
  seatingDays: number;
  /** participants seated on the first seating day */
  seated: number;
  reports?: number;
}

/**
 * Persistence boundary. The only implementation today is the IndexedDB
 * store (src/store/localStore.ts) — swap in an HttpStore backed by
 * Postgres/object storage later without touching feature code. See
 * docs/discovery.md section 6.
 */
export interface AnomiaStore {
  createClassGroup(input: {
    name: string;
    scheduleLabel?: string | null;
    room?: string | null;
    estimatedParticipants?: number | null;
    tableLayout?: TableLayoutTemplate;
  }): Promise<ClassGroup>;
  listClassGroups(): Promise<ClassGroup[]>;
  getClassGroup(id: string): Promise<ClassGroup | undefined>;
  updateClassGroup(id: string, patch: Partial<Omit<ClassGroup, "id" | "createdAt">>): Promise<void>;
  deleteClassGroup(id: string): Promise<void>;
  getClassStats(classGroupId: string): Promise<ClassStats>;

  importRoster(classGroupId: string, rows: RosterRow[]): Promise<Participant[]>;
  createParticipant(classGroupId: string, details: RosterRow): Promise<Participant>;
  listParticipants(classGroupId: string): Promise<Participant[]>;
  updateParticipant(
    id: string,
    patch: Partial<ParticipantDetails & Pick<Participant, "primaryFaceId">>
  ): Promise<void>;
  /** Hapus peserta: wajahnya kembali "belum dilabeli", kursinya dikosongkan. */
  deleteParticipant(id: string): Promise<void>;

  addPhotoWithFaces(input: {
    classGroupId: string;
    dataUrl: string;
    width: number;
    height: number;
    role: PhotoRole;
    fileName?: string | null;
    thumbDataUrl?: string | null;
    faces: NewFaceInput[];
  }): Promise<Photo>;
  /** Tambah wajah ke foto yang sudah ada (pindai ulang / tandai manual). */
  addFacesToPhoto(photoId: string, faces: NewFaceInput[]): Promise<DetectedFace[]>;
  getPhoto(photoId: string): Promise<Photo | undefined>;
  updatePhoto(photoId: string, patch: Partial<Pick<Photo, "role">>): Promise<void>;
  getImageAsset(assetId: string): Promise<ImageAsset | undefined>;
  listPhotos(classGroupId: string): Promise<Photo[]>;
  deletePhoto(photoId: string): Promise<void>;
  listDetectedFaces(classGroupId: string): Promise<DetectedFace[]>;
  listEmbeddings(classGroupId: string): Promise<FaceEmbedding[]>;

  assignFacesToParticipant(faceIds: string[], participantId: string): Promise<void>;
  rejectFaces(faceIds: string[]): Promise<void>;
  /** Kembalikan wajah ke antrean "belum dilabeli" (lepas label / pulihkan dari diabaikan). */
  resetFaces(faceIds: string[]): Promise<void>;
  /** Tulis ulang status beberapa wajah sekaligus — dipakai untuk undo. */
  setFaceStates(states: FaceState[]): Promise<void>;
  deleteFaces(faceIds: string[]): Promise<void>;

  listSeatingDays(classGroupId: string): Promise<SeatingDay[]>;
  createSeatingDay(
    classGroupId: string,
    label: string,
    layoutTemplate: TableLayoutTemplate,
    room?: { roomWidth: number; roomDepth: number }
  ): Promise<SeatingDay>;
  /** Buat hari baru dengan menyalin denah (meja & posisi) dari hari lain. */
  duplicateSeatingDay(sourceDayId: string, label: string, mode: NewDayMode): Promise<SeatingDay>;
  updateSeatingDay(
    id: string,
    patch: Partial<Pick<SeatingDay, "label" | "layoutTemplate" | "locked" | "order" | "roomWidth" | "roomDepth">>
  ): Promise<void>;
  deleteSeatingDay(id: string): Promise<void>;

  listSeatingTables(seatingDayId: string): Promise<SeatingTable[]>;
  createSeatingTable(seatingDayId: string, draft: TableDraft): Promise<SeatingTable>;
  updateSeatingTable(
    id: string,
    patch: Partial<Pick<SeatingTable, "name" | "seatCount" | "order" | "shape" | "x" | "y" | "rotation">>
  ): Promise<void>;
  deleteSeatingTable(id: string): Promise<void>;
  /**
   * Ganti seluruh meja di satu hari (dipakai saat memilih template denah).
   * `seating` = daftar peserta per urutan kursi baru (table index, seat index).
   */
  replaceDayTables(
    seatingDayId: string,
    tables: TableDraft[],
    seating?: Array<{ tableIndex: number; seatIndex: number; participantId: string }>
  ): Promise<SeatingTable[]>;

  /**
   * Put a day's tables and assignments back exactly as they were (same ids) —
   * used by layout undo so older seat-undo snapshots keep pointing at valid tables.
   */
  restoreDaySnapshot(seatingDayId: string, snapshot: { tables: SeatingTable[]; assignments: SeatAssignment[] }): Promise<void>;

  listSeatAssignments(seatingDayId: string): Promise<SeatAssignment[]>;
  /**
   * Dudukkan peserta di kursi. Kalau kursi terisi orang lain: bertukar tempat
   * (kalau peserta sebelumnya sudah duduk), atau penghuni lama jadi belum duduk.
   */
  assignSeat(seatingTableId: string, seatIndex: number, participantId: string): Promise<void>;
  unassignParticipant(seatingDayId: string, participantId: string): Promise<void>;
  /** Tulis ulang seluruh penempatan satu hari — dipakai untuk undo. */
  setDayAssignments(
    seatingDayId: string,
    assignments: Array<Pick<SeatAssignment, "seatingTableId" | "seatIndex" | "participantId">>
  ): Promise<void>;
  autoAssignSeats(seatingDayId: string, strategy?: AutoAssignStrategy): Promise<void>;
  shuffleSeats(seatingDayId: string): Promise<void>;
  clearSeats(seatingDayId: string): Promise<void>;

  listReports(classGroupId: string): Promise<InstructorReport[]>;
  getReport(id: string): Promise<InstructorReport | undefined>;
  saveReport(report: InstructorReport): Promise<void>;
  deleteReport(id: string): Promise<void>;
  getDefaultReport(classGroupId: string): Promise<InstructorReport>;
}
