import Dexie, { type EntityTable } from "dexie";
import type { ClassGroup, Participant, Person } from "@/domain/participant";
import type { DetectedFace, FaceEmbedding, ImageAsset, Photo } from "@/domain/face";
import type { SeatAssignment, SeatingDay, SeatingTable } from "@/domain/layout";

export class AnomiaDatabase extends Dexie {
  classGroups!: EntityTable<ClassGroup, "id">;
  persons!: EntityTable<Person, "id">;
  participants!: EntityTable<Participant, "id">;
  imageAssets!: EntityTable<ImageAsset, "id">;
  photos!: EntityTable<Photo, "id">;
  detectedFaces!: EntityTable<DetectedFace, "id">;
  faceEmbeddings!: EntityTable<FaceEmbedding, "id">;
  seatingDays!: EntityTable<SeatingDay, "id">;
  seatingTables!: EntityTable<SeatingTable, "id">;
  seatAssignments!: EntityTable<SeatAssignment, "id">;

  constructor() {
    super("anomia");
    this.version(1).stores({
      classGroups: "id, name, createdAt",
      persons: "id",
      participants: "id, classGroupId, personId",
      imageAssets: "id",
      photos: "id, classGroupId",
      detectedFaces: "id, photoId, classGroupId, participantId, status",
      faceEmbeddings: "id, detectedFaceId",
    });
    this.version(2).stores({
      classGroups: "id, name, createdAt",
      persons: "id",
      participants: "id, classGroupId, personId",
      imageAssets: "id",
      photos: "id, classGroupId",
      detectedFaces: "id, photoId, classGroupId, participantId, status",
      faceEmbeddings: "id, detectedFaceId",
      seatingDays: "id, classGroupId",
      seatingTables: "id, seatingDayId",
      seatAssignments: "id, seatingTableId, participantId",
    });
  }
}

export const db = new AnomiaDatabase();
