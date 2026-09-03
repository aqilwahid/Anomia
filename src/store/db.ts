import Dexie, { type EntityTable } from "dexie";
import type { ClassGroup, Participant, Person } from "@/domain/participant";
import type { DetectedFace, FaceEmbedding, ImageAsset, Photo } from "@/domain/face";

export class AnomiaDatabase extends Dexie {
  classGroups!: EntityTable<ClassGroup, "id">;
  persons!: EntityTable<Person, "id">;
  participants!: EntityTable<Participant, "id">;
  imageAssets!: EntityTable<ImageAsset, "id">;
  photos!: EntityTable<Photo, "id">;
  detectedFaces!: EntityTable<DetectedFace, "id">;
  faceEmbeddings!: EntityTable<FaceEmbedding, "id">;

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
  }
}

export const db = new AnomiaDatabase();
