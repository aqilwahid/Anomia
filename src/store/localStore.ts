import { nanoid } from "nanoid";
import { db } from "./db";
import type { AnomiaStore } from "./store";
import type { ClassGroup, Participant, Person } from "@/domain/participant";
import type { DetectedFace, FaceEmbedding, Photo } from "@/domain/face";
import type { SeatAssignment, SeatingDay, SeatingTable } from "@/domain/layout";

function now(): string {
  return new Date().toISOString();
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export const localStore: AnomiaStore = {
  async createClassGroup({ name, scheduleLabel = null, room = null, estimatedParticipants = null, tableLayout = "banquet" }) {
    const classGroup: ClassGroup = {
      id: nanoid(),
      name,
      scheduleLabel,
      room,
      estimatedParticipants,
      tableLayout,
      createdAt: now(),
    };
    await db.classGroups.add(classGroup);
    return classGroup;
  },

  async listClassGroups() {
    return db.classGroups.orderBy("createdAt").reverse().toArray();
  },

  async getClassGroup(id) {
    return db.classGroups.get(id);
  },

  async updateClassGroup(id, patch) {
    await db.classGroups.update(id, patch);
  },

  async deleteClassGroup(id) {
    await db.transaction(
      "rw",
      [
        db.classGroups,
        db.participants,
        db.persons,
        db.photos,
        db.imageAssets,
        db.detectedFaces,
        db.faceEmbeddings,
        db.seatingDays,
        db.seatingTables,
        db.seatAssignments,
      ],
      async () => {
        const participants = await db.participants.where({ classGroupId: id }).toArray();
        const personIds = participants.map((p) => p.personId);
        const faces = await db.detectedFaces.where({ classGroupId: id }).toArray();
        const faceIds = faces.map((f) => f.id);
        const photos = await db.photos.where({ classGroupId: id }).toArray();
        const assetIds = photos.map((p) => p.imageAssetId);
        const seatingDays = await db.seatingDays.where({ classGroupId: id }).toArray();
        const seatingDayIds = seatingDays.map((d) => d.id);
        const seatingTables = await db.seatingTables.where("seatingDayId").anyOf(seatingDayIds).toArray();
        const seatingTableIds = seatingTables.map((t) => t.id);

        await db.seatAssignments.where("seatingTableId").anyOf(seatingTableIds).delete();
        await db.seatingTables.bulkDelete(seatingTableIds);
        await db.seatingDays.bulkDelete(seatingDayIds);
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
        organization: null,
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

  async createParticipant(classGroupId, displayName, organization = null) {
    const person: Person = { id: nanoid(), displayName, createdAt: now() };
    const participant: Participant = {
      id: nanoid(),
      classGroupId,
      personId: person.id,
      displayName,
      organization,
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

  async updateParticipant(id, patch) {
    await db.participants.update(id, patch);
    if (patch.displayName !== undefined) {
      const participant = await db.participants.get(id);
      if (participant) await db.persons.update(participant.personId, { displayName: patch.displayName });
    }
  },

  async deleteParticipant(id) {
    await db.transaction("rw", [db.participants, db.persons, db.detectedFaces], async () => {
      const participant = await db.participants.get(id);
      if (!participant) return;
      const faces = await db.detectedFaces.where({ participantId: id }).toArray();
      for (const face of faces) {
        await db.detectedFaces.update(face.id, { participantId: null, status: "unlabeled" });
      }
      await db.participants.delete(id);
      await db.persons.delete(participant.personId);
    });
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

  async deletePhoto(photoId) {
    await db.transaction("rw", [db.photos, db.imageAssets, db.detectedFaces, db.faceEmbeddings], async () => {
      const photo = await db.photos.get(photoId);
      if (!photo) return;
      const faces = await db.detectedFaces.where({ photoId }).toArray();
      const faceIds = faces.map((f) => f.id);
      await db.faceEmbeddings.where("detectedFaceId").anyOf(faceIds).delete();
      await db.detectedFaces.bulkDelete(faceIds);
      await db.imageAssets.delete(photo.imageAssetId);
      await db.photos.delete(photoId);
    });
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

  async listSeatingDays(classGroupId) {
    const days = await db.seatingDays.where({ classGroupId }).toArray();
    return days.sort((a, b) => a.order - b.order);
  },

  async createSeatingDay(classGroupId, label, layoutTemplate) {
    const existing = await db.seatingDays.where({ classGroupId }).toArray();
    const seatingDay: SeatingDay = {
      id: nanoid(),
      classGroupId,
      label,
      order: existing.length,
      layoutTemplate,
      locked: false,
      createdAt: now(),
    };
    await db.seatingDays.add(seatingDay);
    return seatingDay;
  },

  async updateSeatingDay(id, patch) {
    await db.seatingDays.update(id, patch);
  },

  async deleteSeatingDay(id) {
    await db.transaction("rw", [db.seatingDays, db.seatingTables, db.seatAssignments], async () => {
      const tables = await db.seatingTables.where({ seatingDayId: id }).toArray();
      const tableIds = tables.map((t) => t.id);
      await db.seatAssignments.where("seatingTableId").anyOf(tableIds).delete();
      await db.seatingTables.bulkDelete(tableIds);
      await db.seatingDays.delete(id);
    });
  },

  async listSeatingTables(seatingDayId) {
    const tables = await db.seatingTables.where({ seatingDayId }).toArray();
    return tables.sort((a, b) => a.order - b.order);
  },

  async createSeatingTable(seatingDayId, name, seatCount) {
    const existing = await db.seatingTables.where({ seatingDayId }).toArray();
    const table: SeatingTable = {
      id: nanoid(),
      seatingDayId,
      name,
      seatCount,
      order: existing.length,
    };
    await db.seatingTables.add(table);
    return table;
  },

  async updateSeatingTable(id, patch) {
    await db.seatingTables.update(id, patch);
  },

  async deleteSeatingTable(id) {
    await db.transaction("rw", [db.seatingTables, db.seatAssignments], async () => {
      await db.seatAssignments.where({ seatingTableId: id }).delete();
      await db.seatingTables.delete(id);
    });
  },

  async listSeatAssignments(seatingDayId) {
    const tables = await db.seatingTables.where({ seatingDayId }).toArray();
    const tableIds = tables.map((t) => t.id);
    return db.seatAssignments.where("seatingTableId").anyOf(tableIds).toArray();
  },

  async assignSeat(seatingTableId, seatIndex, participantId) {
    const table = await db.seatingTables.get(seatingTableId);
    if (!table) return;
    await db.transaction("rw", [db.seatingTables, db.seatAssignments], async () => {
      const dayTables = await db.seatingTables.where({ seatingDayId: table.seatingDayId }).toArray();
      const dayTableIds = dayTables.map((t) => t.id);
      const dayAssignments = await db.seatAssignments.where("seatingTableId").anyOf(dayTableIds).toArray();

      const priorForParticipant = dayAssignments.find((a) => a.participantId === participantId);
      if (priorForParticipant) await db.seatAssignments.delete(priorForParticipant.id);

      const priorForSeat = dayAssignments.find(
        (a) => a.seatingTableId === seatingTableId && a.seatIndex === seatIndex
      );
      if (priorForSeat) await db.seatAssignments.delete(priorForSeat.id);

      const assignment: SeatAssignment = { id: nanoid(), seatingTableId, seatIndex, participantId };
      await db.seatAssignments.add(assignment);
    });
  },

  async unassignSeat(seatingTableId, seatIndex) {
    const existing = await db.seatAssignments.where({ seatingTableId, seatIndex }).first();
    if (existing) await db.seatAssignments.delete(existing.id);
  },

  async autoAssignSeats(seatingDayId) {
    const day = await db.seatingDays.get(seatingDayId);
    if (!day) return;

    const tables = await this.listSeatingTables(seatingDayId);
    const assignments = await this.listSeatAssignments(seatingDayId);
    const occupiedSlots = new Set(assignments.map((a) => `${a.seatingTableId}:${a.seatIndex}`));
    const seatedParticipantIds = new Set(assignments.map((a) => a.participantId));

    const emptySlots: Array<{ seatingTableId: string; seatIndex: number }> = [];
    for (const table of tables) {
      for (let seatIndex = 0; seatIndex < table.seatCount; seatIndex++) {
        if (!occupiedSlots.has(`${table.id}:${seatIndex}`)) {
          emptySlots.push({ seatingTableId: table.id, seatIndex });
        }
      }
    }

    const participants = await this.listParticipants(day.classGroupId);
    const unseated = participants.filter((p) => !seatedParticipantIds.has(p.id));

    const pairs = unseated.slice(0, emptySlots.length).map((participant, i) => ({
      slot: emptySlots[i],
      participantId: participant.id,
    }));

    await db.transaction("rw", db.seatAssignments, async () => {
      for (const { slot, participantId } of pairs) {
        await db.seatAssignments.add({
          id: nanoid(),
          seatingTableId: slot.seatingTableId,
          seatIndex: slot.seatIndex,
          participantId,
        });
      }
    });
  },

  async shuffleSeats(seatingDayId) {
    const assignments = await this.listSeatAssignments(seatingDayId);
    if (assignments.length < 2) return;

    const slots = assignments.map((a) => ({ seatingTableId: a.seatingTableId, seatIndex: a.seatIndex }));
    const participantIds = shuffleInPlace(assignments.map((a) => a.participantId));

    await db.transaction("rw", db.seatAssignments, async () => {
      await db.seatAssignments.bulkDelete(assignments.map((a) => a.id));
      const shuffled: SeatAssignment[] = slots.map((slot, i) => ({
        id: nanoid(),
        seatingTableId: slot.seatingTableId,
        seatIndex: slot.seatIndex,
        participantId: participantIds[i],
      }));
      await db.seatAssignments.bulkAdd(shuffled);
    });
  },
};
