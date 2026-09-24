import { nanoid } from "nanoid";
import { db } from "./db";
import type { AnomiaStore, AutoAssignStrategy, NewFaceInput, RosterRow } from "./store";
import type { ClassGroup, Participant, Person } from "@/domain/participant";
import type { DetectedFace, FaceEmbedding, Photo } from "@/domain/face";
import type { SeatAssignment, SeatingDay, SeatingTable } from "@/domain/layout";
import type { InstructorReport } from "@/domain/report";

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

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function buildParticipant(classGroupId: string, row: RosterRow, fromRoster: boolean, createdAt = now()) {
  const displayName = row.displayName.trim();
  const person: Person = { id: nanoid(), displayName, createdAt };
  const participant: Participant = {
    id: nanoid(),
    classGroupId,
    personId: person.id,
    displayName,
    organization: clean(row.organization),
    jobTitle: clean(row.jobTitle),
    email: clean(row.email),
    phone: clean(row.phone),
    notes: clean(row.notes),
    primaryFaceId: null,
    fromRoster,
    createdAt,
  };
  return { person, participant };
}

function buildFaceRows(classGroupId: string, photoId: string, faces: NewFaceInput[]) {
  const detectedFaces: DetectedFace[] = [];
  const embeddingRows: FaceEmbedding[] = [];
  for (const { face, embedding, modelName, modelVersion } of faces) {
    const detectedFace: DetectedFace = {
      ...face,
      id: nanoid(),
      photoId,
      classGroupId,
      createdAt: now(),
    };
    detectedFaces.push(detectedFace);
    if (embedding && embedding.length > 0) {
      embeddingRows.push({
        id: nanoid(),
        detectedFaceId: detectedFace.id,
        modelName,
        modelVersion,
        vector: embedding,
        normalized: true,
      });
    }
  }
  return { detectedFaces, embeddingRows };
}

async function dayAssignments(seatingDayId: string) {
  const tables = await db.seatingTables.where({ seatingDayId }).toArray();
  const tableIds = tables.map((t) => t.id);
  const assignments = tableIds.length
    ? await db.seatAssignments.where("seatingTableId").anyOf(tableIds).toArray()
    : [];
  return { tables: tables.sort((a, b) => a.order - b.order), assignments };
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
        await db.instructorReports.where({ classGroupId: id }).delete();
        await db.participants.where({ classGroupId: id }).delete();
        await db.persons.bulkDelete(personIds);
        await db.classGroups.delete(id);
      }
    );
  },

  async getClassStats(classGroupId) {
    const [participants, photos, faces, reports] = await Promise.all([
      db.participants.where({ classGroupId }).toArray(),
      db.photos.where({ classGroupId }).count(),
      db.detectedFaces.where({ classGroupId }).toArray(),
      db.instructorReports.where({ classGroupId }).count(),
    ]);
    const active = faces.filter((f) => f.status !== "not_a_face" && f.status !== "rejected");
    const labeled = active.filter((f) => f.status === "assigned");
    const withFace = new Set(labeled.map((f) => f.participantId));
    const days = (await db.seatingDays.where({ classGroupId }).toArray()).sort((a, b) => a.order - b.order);
    const participantIds = new Set(participants.map((p) => p.id));
    const seated = days.length
      ? new Set(
          (await dayAssignments(days[0].id)).assignments
            .map((a) => a.participantId)
            .filter((id) => participantIds.has(id))
        ).size
      : 0;
    return {
      participants: participants.length,
      photos,
      faces: active.length,
      labeledFaces: labeled.length,
      participantsWithFace: participants.filter((p) => withFace.has(p.id)).length,
      seatingDays: days.length,
      seated,
      reports,
    };
  },

  async importRoster(classGroupId, rows) {
    const participants: Participant[] = [];
    const persons: Person[] = [];
    // strictly increasing timestamps keep the pasted order (the list is sorted by createdAt)
    const base = Date.now();
    for (const [i, row] of rows.entries()) {
      if (!row.displayName.trim()) continue;
      const built = buildParticipant(classGroupId, row, true, new Date(base + i).toISOString());
      persons.push(built.person);
      participants.push(built.participant);
    }
    await db.transaction("rw", [db.persons, db.participants], async () => {
      await db.persons.bulkAdd(persons);
      await db.participants.bulkAdd(participants);
    });
    return participants;
  },

  async createParticipant(classGroupId, details) {
    const { person, participant } = buildParticipant(classGroupId, details, false);
    await db.transaction("rw", [db.persons, db.participants], async () => {
      await db.persons.add(person);
      await db.participants.add(participant);
    });
    return participant;
  },

  async listParticipants(classGroupId) {
    const participants = await db.participants.where({ classGroupId }).toArray();
    return participants.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async updateParticipant(id, patch) {
    const normalized: Partial<Participant> = {};
    if (patch.displayName !== undefined) {
      const name = patch.displayName.trim();
      if (name) normalized.displayName = name;
    }
    if (patch.organization !== undefined) normalized.organization = clean(patch.organization);
    if (patch.jobTitle !== undefined) normalized.jobTitle = clean(patch.jobTitle);
    if (patch.email !== undefined) normalized.email = clean(patch.email);
    if (patch.phone !== undefined) normalized.phone = clean(patch.phone);
    if (patch.notes !== undefined) normalized.notes = clean(patch.notes);
    if (patch.primaryFaceId !== undefined) normalized.primaryFaceId = patch.primaryFaceId;
    await db.participants.update(id, normalized);
    if (normalized.displayName !== undefined) {
      const participant = await db.participants.get(id);
      if (participant) await db.persons.update(participant.personId, { displayName: normalized.displayName });
    }
  },

  async deleteParticipant(id) {
    await db.transaction("rw", [db.participants, db.persons, db.detectedFaces, db.seatAssignments], async () => {
      const participant = await db.participants.get(id);
      if (!participant) return;
      const faces = await db.detectedFaces.where({ participantId: id }).toArray();
      for (const face of faces) {
        await db.detectedFaces.update(face.id, { participantId: null, status: "unlabeled" });
      }
      await db.seatAssignments.where({ participantId: id }).delete();
      await db.participants.delete(id);
      await db.persons.delete(participant.personId);
    });
  },

  async addPhotoWithFaces({ classGroupId, dataUrl, width, height, role, fileName = null, thumbDataUrl = null, faces }) {
    const imageAsset = { id: nanoid(), dataUrl, width, height };
    const photo: Photo = {
      id: nanoid(),
      classGroupId,
      imageAssetId: imageAsset.id,
      role,
      fileName,
      thumbDataUrl,
      createdAt: now(),
    };
    const { detectedFaces, embeddingRows } = buildFaceRows(classGroupId, photo.id, faces);

    await db.transaction("rw", [db.imageAssets, db.photos, db.detectedFaces, db.faceEmbeddings], async () => {
      await db.imageAssets.add(imageAsset);
      await db.photos.add(photo);
      if (detectedFaces.length > 0) await db.detectedFaces.bulkAdd(detectedFaces);
      if (embeddingRows.length > 0) await db.faceEmbeddings.bulkAdd(embeddingRows);
    });

    return photo;
  },

  async addFacesToPhoto(photoId, faces) {
    const photo = await db.photos.get(photoId);
    if (!photo) return [];
    const { detectedFaces, embeddingRows } = buildFaceRows(photo.classGroupId, photo.id, faces);
    await db.transaction("rw", [db.detectedFaces, db.faceEmbeddings], async () => {
      if (detectedFaces.length > 0) await db.detectedFaces.bulkAdd(detectedFaces);
      if (embeddingRows.length > 0) await db.faceEmbeddings.bulkAdd(embeddingRows);
    });
    return detectedFaces;
  },

  async getPhoto(photoId) {
    return db.photos.get(photoId);
  },

  async updatePhoto(photoId, patch) {
    await db.photos.update(photoId, patch);
  },

  async getImageAsset(assetId) {
    return db.imageAssets.get(assetId);
  },

  async listPhotos(classGroupId) {
    const photos = await db.photos.where({ classGroupId }).toArray();
    return photos.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async deletePhoto(photoId) {
    await db.transaction(
      "rw",
      [db.photos, db.imageAssets, db.detectedFaces, db.faceEmbeddings, db.participants],
      async () => {
        const photo = await db.photos.get(photoId);
        if (!photo) return;
        const faces = await db.detectedFaces.where({ photoId }).toArray();
        const faceIds = faces.map((f) => f.id);
        await db.faceEmbeddings.where("detectedFaceId").anyOf(faceIds).delete();
        await db.detectedFaces.bulkDelete(faceIds);
        await db.imageAssets.delete(photo.imageAssetId);
        await db.photos.delete(photoId);
        const faceIdSet = new Set(faceIds);
        const participants = await db.participants.where({ classGroupId: photo.classGroupId }).toArray();
        for (const p of participants) {
          if (p.primaryFaceId && faceIdSet.has(p.primaryFaceId)) {
            await db.participants.update(p.id, { primaryFaceId: null });
          }
        }
      }
    );
  },

  async listDetectedFaces(classGroupId) {
    return db.detectedFaces.where({ classGroupId }).toArray();
  },

  async listEmbeddings(classGroupId) {
    const faces = await db.detectedFaces.where({ classGroupId }).toArray();
    const faceIds = faces.map((f) => f.id);
    if (faceIds.length === 0) return [];
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

  async resetFaces(faceIds) {
    await db.transaction("rw", db.detectedFaces, async () => {
      for (const faceId of faceIds) {
        await db.detectedFaces.update(faceId, { participantId: null, status: "unlabeled" });
      }
    });
  },

  async setFaceStates(states) {
    await db.transaction("rw", db.detectedFaces, async () => {
      for (const s of states) {
        await db.detectedFaces.update(s.id, { status: s.status, participantId: s.participantId });
      }
    });
  },

  async deleteFaces(faceIds) {
    if (faceIds.length === 0) return;
    await db.transaction("rw", [db.detectedFaces, db.faceEmbeddings, db.participants], async () => {
      const faces = await db.detectedFaces.bulkGet(faceIds);
      await db.faceEmbeddings.where("detectedFaceId").anyOf(faceIds).delete();
      await db.detectedFaces.bulkDelete(faceIds);
      const classIds = new Set(faces.filter(Boolean).map((f) => f!.classGroupId));
      const idSet = new Set(faceIds);
      for (const classGroupId of classIds) {
        const participants = await db.participants.where({ classGroupId }).toArray();
        for (const p of participants) {
          if (p.primaryFaceId && idSet.has(p.primaryFaceId)) {
            await db.participants.update(p.id, { primaryFaceId: null });
          }
        }
      }
    });
  },

  async listSeatingDays(classGroupId) {
    const days = await db.seatingDays.where({ classGroupId }).toArray();
    return days.sort((a, b) => a.order - b.order);
  },

  async createSeatingDay(classGroupId, label, layoutTemplate, room) {
    const existing = await db.seatingDays.where({ classGroupId }).toArray();
    const seatingDay: SeatingDay = {
      id: nanoid(),
      classGroupId,
      label,
      order: existing.reduce((max, d) => Math.max(max, d.order + 1), 0),
      layoutTemplate,
      locked: false,
      roomWidth: room?.roomWidth,
      roomDepth: room?.roomDepth,
      createdAt: now(),
    };
    await db.seatingDays.add(seatingDay);
    return seatingDay;
  },

  async duplicateSeatingDay(sourceDayId, label, mode) {
    const source = await db.seatingDays.get(sourceDayId);
    if (!source) throw new Error("Hari sumber tidak ditemukan");
    const { tables, assignments } = await dayAssignments(sourceDayId);
    const existing = await db.seatingDays.where({ classGroupId: source.classGroupId }).toArray();

    const day: SeatingDay = {
      ...source,
      id: nanoid(),
      label,
      locked: false,
      order: existing.reduce((max, d) => Math.max(max, d.order + 1), 0),
      createdAt: now(),
    };
    const idMap = new Map<string, string>();
    const newTables: SeatingTable[] = tables.map((t) => {
      const id = nanoid();
      idMap.set(t.id, id);
      return { ...t, id, seatingDayId: day.id };
    });

    let newAssignments: SeatAssignment[] = [];
    if (mode !== "empty") {
      newAssignments = assignments
        .filter((a) => idMap.has(a.seatingTableId))
        .map((a) => ({ ...a, id: nanoid(), seatingTableId: idMap.get(a.seatingTableId)! }));
      if (mode === "shuffle" && newAssignments.length > 1) {
        const ids = shuffleInPlace(newAssignments.map((a) => a.participantId));
        newAssignments = newAssignments.map((a, i) => ({ ...a, participantId: ids[i] }));
      }
    }

    await db.transaction("rw", [db.seatingDays, db.seatingTables, db.seatAssignments], async () => {
      await db.seatingDays.add(day);
      if (newTables.length) await db.seatingTables.bulkAdd(newTables);
      if (newAssignments.length) await db.seatAssignments.bulkAdd(newAssignments);
    });
    return day;
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

  async createSeatingTable(seatingDayId, draft) {
    const existing = await db.seatingTables.where({ seatingDayId }).toArray();
    const table: SeatingTable = {
      ...draft,
      id: nanoid(),
      seatingDayId,
      order: draft.order ?? existing.reduce((max, t) => Math.max(max, t.order + 1), 0),
    };
    await db.seatingTables.add(table);
    return table;
  },

  async updateSeatingTable(id, patch) {
    await db.transaction("rw", [db.seatingTables, db.seatAssignments], async () => {
      await db.seatingTables.update(id, patch);
      if (patch.seatCount !== undefined) {
        const stale = await db.seatAssignments.where({ seatingTableId: id }).toArray();
        const drop = stale.filter((a) => a.seatIndex >= patch.seatCount!).map((a) => a.id);
        if (drop.length) await db.seatAssignments.bulkDelete(drop);
      }
    });
  },

  async deleteSeatingTable(id) {
    await db.transaction("rw", [db.seatingTables, db.seatAssignments], async () => {
      await db.seatAssignments.where({ seatingTableId: id }).delete();
      await db.seatingTables.delete(id);
    });
  },

  async replaceDayTables(seatingDayId, drafts, seating = []) {
    const created: SeatingTable[] = drafts.map((d, i) => ({
      ...d,
      id: nanoid(),
      seatingDayId,
      order: i,
    }));
    await db.transaction("rw", [db.seatingTables, db.seatAssignments], async () => {
      const old = await db.seatingTables.where({ seatingDayId }).toArray();
      const oldIds = old.map((t) => t.id);
      if (oldIds.length) {
        await db.seatAssignments.where("seatingTableId").anyOf(oldIds).delete();
        await db.seatingTables.bulkDelete(oldIds);
      }
      if (created.length) await db.seatingTables.bulkAdd(created);
      const seen = new Set<string>();
      const rows: SeatAssignment[] = [];
      for (const s of seating) {
        const table = created[s.tableIndex];
        if (!table || s.seatIndex >= table.seatCount || seen.has(s.participantId)) continue;
        seen.add(s.participantId);
        rows.push({ id: nanoid(), seatingTableId: table.id, seatIndex: s.seatIndex, participantId: s.participantId });
      }
      if (rows.length) await db.seatAssignments.bulkAdd(rows);
    });
    return created;
  },

  async restoreDaySnapshot(seatingDayId, snapshot) {
    await db.transaction("rw", [db.seatingTables, db.seatAssignments], async () => {
      const { tables, assignments } = await dayAssignments(seatingDayId);
      if (assignments.length) await db.seatAssignments.bulkDelete(assignments.map((a) => a.id));
      if (tables.length) await db.seatingTables.bulkDelete(tables.map((t) => t.id));
      const rows = snapshot.tables.map((t) => ({ ...t, seatingDayId }));
      if (rows.length) await db.seatingTables.bulkPut(rows);
      const valid = new Set(rows.map((t) => t.id));
      const seats = snapshot.assignments.filter((a) => valid.has(a.seatingTableId));
      if (seats.length) await db.seatAssignments.bulkPut(seats);
    });
  },

  async listSeatAssignments(seatingDayId) {
    return (await dayAssignments(seatingDayId)).assignments;
  },

  async assignSeat(seatingTableId, seatIndex, participantId) {
    const table = await db.seatingTables.get(seatingTableId);
    if (!table || seatIndex < 0 || seatIndex >= table.seatCount) return;
    await db.transaction("rw", [db.seatingTables, db.seatAssignments], async () => {
      const { assignments } = await dayAssignments(table.seatingDayId);
      const mover = assignments.find((a) => a.participantId === participantId);
      const occupant = assignments.find((a) => a.seatingTableId === seatingTableId && a.seatIndex === seatIndex);
      if (occupant && occupant.participantId === participantId) return;

      if (mover) await db.seatAssignments.delete(mover.id);
      if (occupant) {
        if (mover) {
          // tukar tempat: penghuni lama pindah ke kursi asal peserta yang dipindah
          await db.seatAssignments.update(occupant.id, {
            seatingTableId: mover.seatingTableId,
            seatIndex: mover.seatIndex,
          });
        } else {
          await db.seatAssignments.delete(occupant.id);
        }
      }
      await db.seatAssignments.add({ id: nanoid(), seatingTableId, seatIndex, participantId });
    });
  },

  async unassignParticipant(seatingDayId, participantId) {
    const { assignments } = await dayAssignments(seatingDayId);
    const ids = assignments.filter((a) => a.participantId === participantId).map((a) => a.id);
    if (ids.length) await db.seatAssignments.bulkDelete(ids);
  },

  async setDayAssignments(seatingDayId, next) {
    await db.transaction("rw", [db.seatingTables, db.seatAssignments], async () => {
      const { tables, assignments } = await dayAssignments(seatingDayId);
      const valid = new Map(tables.map((t) => [t.id, t.seatCount]));
      await db.seatAssignments.bulkDelete(assignments.map((a) => a.id));
      const seen = new Set<string>();
      const rows: SeatAssignment[] = [];
      for (const a of next) {
        const count = valid.get(a.seatingTableId);
        if (count === undefined || a.seatIndex >= count || seen.has(a.participantId)) continue;
        seen.add(a.participantId);
        rows.push({ id: nanoid(), seatingTableId: a.seatingTableId, seatIndex: a.seatIndex, participantId: a.participantId });
      }
      if (rows.length) await db.seatAssignments.bulkAdd(rows);
    });
  },

  async autoAssignSeats(seatingDayId, strategy: AutoAssignStrategy = "order") {
    const day = await db.seatingDays.get(seatingDayId);
    if (!day) return;

    const { tables, assignments } = await dayAssignments(seatingDayId);
    const occupied = new Set(assignments.map((a) => `${a.seatingTableId}:${a.seatIndex}`));
    const seated = new Set(assignments.map((a) => a.participantId));

    const emptySlots: Array<{ seatingTableId: string; seatIndex: number }> = [];
    if (strategy === "mix-org") {
      // round-robin antar meja: kursi 1 semua meja, lalu kursi 2 semua meja, dst.
      const maxSeats = tables.reduce((max, t) => Math.max(max, t.seatCount), 0);
      for (let seatIndex = 0; seatIndex < maxSeats; seatIndex++) {
        for (const table of tables) {
          if (seatIndex < table.seatCount && !occupied.has(`${table.id}:${seatIndex}`)) {
            emptySlots.push({ seatingTableId: table.id, seatIndex });
          }
        }
      }
    } else {
      for (const table of tables) {
        for (let seatIndex = 0; seatIndex < table.seatCount; seatIndex++) {
          if (!occupied.has(`${table.id}:${seatIndex}`)) emptySlots.push({ seatingTableId: table.id, seatIndex });
        }
      }
    }

    const participants = (await db.participants.where({ classGroupId: day.classGroupId }).toArray()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
    let unseated = participants.filter((p) => !seated.has(p.id));
    if (strategy === "random") unseated = shuffleInPlace([...unseated]);
    if (strategy === "mix-org") {
      unseated = [...unseated].sort((a, b) =>
        (a.organization ?? "~").localeCompare(b.organization ?? "~", "id") ||
        a.displayName.localeCompare(b.displayName, "id")
      );
    }

    const rows: SeatAssignment[] = unseated.slice(0, emptySlots.length).map((participant, i) => ({
      id: nanoid(),
      seatingTableId: emptySlots[i].seatingTableId,
      seatIndex: emptySlots[i].seatIndex,
      participantId: participant.id,
    }));
    if (rows.length) await db.seatAssignments.bulkAdd(rows);
  },

  async shuffleSeats(seatingDayId) {
    const { assignments } = await dayAssignments(seatingDayId);
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

  async clearSeats(seatingDayId) {
    const { assignments } = await dayAssignments(seatingDayId);
    if (assignments.length) await db.seatAssignments.bulkDelete(assignments.map((a) => a.id));
  },

  async listReports(classGroupId) {
    const reports = await db.instructorReports.where({ classGroupId }).toArray();
    return reports.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getReport(id) {
    return db.instructorReports.get(id);
  },

  async saveReport(report) {
    const existing = await db.instructorReports.get(report.id);
    const updated: InstructorReport = {
      ...report,
      updatedAt: now(),
    };
    if (existing) {
      await db.instructorReports.put(updated);
    } else {
      await db.instructorReports.add(updated);
    }
  },

  async deleteReport(id) {
    await db.instructorReports.delete(id);
  },

  async getDefaultReport(classGroupId) {
    const reports = await this.listReports(classGroupId);
    if (reports.length > 0) {
      return reports[0];
    }
    const classGroup = await db.classGroups.get(classGroupId);
    const participants = await db.participants.where({ classGroupId }).toArray();
    const days = await db.seatingDays.where({ classGroupId }).toArray();
    const sortedDays = days.sort((a, b) => a.order - b.order);
    const defaultName =
      typeof window !== "undefined"
        ? localStorage.getItem("anomia:instructor-name") || "YAQ"
        : "YAQ";
    const today = new Date().toISOString().slice(0, 10);
    const newReport: InstructorReport = {
      id: nanoid(),
      classGroupId,
      instructorName: defaultName,
      title: `${defaultName} - PELAPORAN HARIAN INSTRUKTUR`,
      className: classGroup?.name ?? "",
      date: today,
      attendancePresent: participants.length,
      attendanceTotal: participants.length,
      attendanceMode: "offline",
      presentParticipantIds: participants.map((p) => p.id),
      absentParticipantIds: [],
      materialProgress: "",
      classCondition: "aktif",
      wagIssue: "Terespon.",
      teamInfo: "-",
      includeSeatingPlan: sortedDays.length > 0,
      seatingDayId: sortedDays.length > 0 ? sortedDays[0].id : null,
      createdAt: now(),
      updatedAt: now(),
    };
    await db.instructorReports.add(newReport);
    return newReport;
  },
};
