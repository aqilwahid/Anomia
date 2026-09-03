import type { ClassGroup, Participant } from "@/domain/participant";
import type { DetectedFace, FaceEmbedding, Photo, PhotoRole } from "@/domain/face";

/**
 * Persistence boundary. The only implementation today is the IndexedDB
 * store (src/store/localStore.ts) — swap in an HttpStore backed by
 * Postgres/object storage later without touching feature code. See
 * docs/discovery.md section 6.
 */
export interface AnomiaStore {
  createClassGroup(name: string): Promise<ClassGroup>;
  listClassGroups(): Promise<ClassGroup[]>;
  getClassGroup(id: string): Promise<ClassGroup | undefined>;
  deleteClassGroup(id: string): Promise<void>;

  importRoster(classGroupId: string, names: string[]): Promise<Participant[]>;
  createParticipant(classGroupId: string, displayName: string): Promise<Participant>;
  listParticipants(classGroupId: string): Promise<Participant[]>;

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
  listDetectedFaces(classGroupId: string): Promise<DetectedFace[]>;
  listEmbeddings(classGroupId: string): Promise<FaceEmbedding[]>;

  assignFacesToParticipant(faceIds: string[], participantId: string): Promise<void>;
  rejectFaces(faceIds: string[]): Promise<void>;
}
