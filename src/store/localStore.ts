import { nanoid } from "nanoid";
import { db } from "./db";
import type { AnomiaStore } from "./store";
import type { ClassGroup, Participant, Person } from "@/domain/participant";
import type { DetectedFace, FaceEmbedding, Photo } from "@/domain/face";

function now(): string {
  return new Date().toISOString();
}

export const localStore: AnomiaStore = {
  async createClassGroup(name) {
    const classGroup: ClassGroup = { id: nanoid(), name, createdAt: now() };
    await db.classGroups.add(classGroup);
    return classGroup;
  },

  async listClassGroups() {
    return db.classGroups.orderBy("createdAt").reverse().toArray();
  },

  async getClassGroup(id) {
    return db.classGroups.get(id);
  },

  async deleteClassGroup(id) {
    await db.transaction(
      "rw",
      [db.classGroups, db.participants, db.persons, db.photos, db.imageAssets, db.detectedFaces, db.faceEmbeddings],
      async () => {
        const participants = await db.participants.where({ classGroupId: id }).toArray();
        const personIds = participants.map((p) => p.personId);
        const faces = await db.detectedFaces.where({ classGroupId: id }).toArray();
        const faceIds = faces.map((f) => f.id);
        const photos = await db.photos.where({ classGroupId: id }).toArray();
        const assetIds = photos.map((p) => p.imageAssetId);

        await db.faceEmbeddings.where("detectedFaceId").anyOf(faceIds).delete();
        await db.detectedFaces.bulkDelete(faceIds);
        await db.photos.where({ classGroupId: id }).delete();
        await db.imageAssets.bulkDelete(assetIds);
        await db.participants.where({ classGroupId: id }).delete();
        await db.persons.bulkDelete(personIds);
        await db.classGroups.delete(id);
      }
    );
  },

  async importRoster(classGroupId, names) {
    const participants: Participant[] = [];
    const persons: Person[] = [];
    for (const rawName of names) {
      const displayName = rawName.trim();
      if (!displayName) continue;
      const person: Person = { id: nanoid(), displayName, createdAt: now() };
      const participant: Participant = {
        id: nanoid(),
        classGroupId,
        personId: person.id,
        displayName,
        fromRoster: true,
        createdAt: now(),
      };
      persons.push(person);
      participants.push(participant);
    }
    await db.persons.bulkAdd(persons);
    await db.participants.bulkAdd(participants);
    return participants;
  },

  async createParticipant(classGroupId, displayName) {
    const person: Person = { id: nanoid(), displayName, createdAt: now() };
    const participant: Participant = {
      id: nanoid(),
      classGroupId,
      personId: person.id,
      displayName,
      fromRoster: false,
      createdAt: now(),
    };
    await db.persons.add(person);
    await db.participants.add(participant);
    return participant;
  },

  async listParticipants(classGroupId) {
    const participants = await db.participants.where({ classGroupId }).toArray();
    return participants.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async addPhotoWithFaces({ classGroupId, dataUrl, width, height, role, faces }) {
    const imageAsset = { id: nanoid(), dataUrl, width, height };
    const photo: Photo = {
      id: nanoid(),
      classGroupId,
      imageAssetId: imageAsset.id,
      role,
      createdAt: now(),
    };

    const detectedFaces: DetectedFace[] = [];
    const embeddingRows: FaceEmbedding[] = [];
    for (const { face, embedding, modelName, modelVersion } of faces) {
      const detectedFace: DetectedFace = {
        ...face,
        id: nanoid(),
        photoId: photo.id,
        classGroupId,
        createdAt: now(),
      };
      detectedFaces.push(detectedFace);
      embeddingRows.push({
        id: nanoid(),
        detectedFaceId: detectedFace.id,
        modelName,
        modelVersion,
        vector: embedding,
        normalized: true,
      });
    }

    await db.transaction("rw", [db.imageAssets, db.photos, db.detectedFaces, db.faceEmbeddings], async () => {
      await db.imageAssets.add(imageAsset);
      await db.photos.add(photo);
      if (detectedFaces.length > 0) await db.detectedFaces.bulkAdd(detectedFaces);
      if (embeddingRows.length > 0) await db.faceEmbeddings.bulkAdd(embeddingRows);
    });

    return photo;
  },

  async listPhotos(classGroupId) {
    return db.photos.where({ classGroupId }).toArray();
  },

  async listDetectedFaces(classGroupId) {
    return db.detectedFaces.where({ classGroupId }).toArray();
  },

  async listEmbeddings(classGroupId) {
    const faces = await db.detectedFaces.where({ classGroupId }).toArray();
    const faceIds = faces.map((f) => f.id);
    return db.faceEmbeddings.where("detectedFaceId").anyOf(faceIds).toArray();
  },

  async assignFacesToParticipant(faceIds, participantId) {
    await db.transaction("rw", db.detectedFaces, async () => {
      for (const faceId of faceIds) {
        await db.detectedFaces.update(faceId, { participantId, status: "assigned" });
      }
    });
  },

  async rejectFaces(faceIds) {
    await db.transaction("rw", db.detectedFaces, async () => {
      for (const faceId of faceIds) {
        await db.detectedFaces.update(faceId, { participantId: null, status: "not_a_face" });
      }
    });
  },
};
