import type { ClassGroup, Participant } from "@/domain/participant";
import type { DetectedFace, FaceEmbedding, Photo, PhotoRole } from "@/domain/face";
import type { SeatAssignment, SeatingDay, SeatingTable, TableLayoutTemplate } from "@/domain/layout";

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

  importRoster(classGroupId: string, names: string[]): Promise<Participant[]>;
  createParticipant(
    classGroupId: string,
    displayName: string,
    organization?: string | null
  ): Promise<Participant>;
  listParticipants(classGroupId: string): Promise<Participant[]>;
  updateParticipant(id: string, patch: Partial<Pick<Participant, "displayName" | "organization">>): Promise<void>;
  deleteParticipant(id: string): Promise<void>;

  addPhotoWithFaces(input: {
    classGroupId: string;
    dataUrl: string;
    width: number;
    height: number;
    role: PhotoRole;
    faces: Array<{
      face: Omit<DetectedFace, "id" | "photoId" | "classGroupId" | "createdAt">;
      embedding: number[];
      modelName: string;
      modelVersion: string;
    }>;
  }): Promise<Photo>;

  listPhotos(classGroupId: string): Promise<Photo[]>;
  deletePhoto(photoId: string): Promise<void>;
  listDetectedFaces(classGroupId: string): Promise<DetectedFace[]>;
  listEmbeddings(classGroupId: string): Promise<FaceEmbedding[]>;

  assignFacesToParticipant(faceIds: string[], participantId: string): Promise<void>;
  rejectFaces(faceIds: string[]): Promise<void>;

  listSeatingDays(classGroupId: string): Promise<SeatingDay[]>;
  createSeatingDay(classGroupId: string, label: string, layoutTemplate: TableLayoutTemplate): Promise<SeatingDay>;
  updateSeatingDay(id: string, patch: Partial<Pick<SeatingDay, "label" | "layoutTemplate" | "locked" | "order">>): Promise<void>;
  deleteSeatingDay(id: string): Promise<void>;

  listSeatingTables(seatingDayId: string): Promise<SeatingTable[]>;
  createSeatingTable(seatingDayId: string, name: string, seatCount: number): Promise<SeatingTable>;
  updateSeatingTable(id: string, patch: Partial<Pick<SeatingTable, "name" | "seatCount" | "order">>): Promise<void>;
  deleteSeatingTable(id: string): Promise<void>;

  listSeatAssignments(seatingDayId: string): Promise<SeatAssignment[]>;
  assignSeat(seatingTableId: string, seatIndex: number, participantId: string): Promise<void>;
  unassignSeat(seatingTableId: string, seatIndex: number): Promise<void>;
  autoAssignSeats(seatingDayId: string): Promise<void>;
  shuffleSeats(seatingDayId: string): Promise<void>;
}
