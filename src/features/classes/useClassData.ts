"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { localStore } from "@/store/localStore";
import type { Participant } from "@/domain/participant";
import type { DetectedFace, FaceEmbedding, Photo } from "@/domain/face";

export interface ParticipantFaceInfo {
  /** best face crop to use as avatar (primary face if chosen) */
  faceUrl: string | null;
  faceId: string | null;
  faceCount: number;
  faces: DetectedFace[];
}

/**
 * Avatar per participant: the instructor's chosen primary face, otherwise
 * the best-quality face, preferring portrait photos over group photos.
 */
export function buildFaceIndex(participants: Participant[], faces: DetectedFace[], photos: Photo[]) {
  const roleByPhoto = new Map(photos.map((p) => [p.id, p.role]));
  const byParticipant = new Map<string, DetectedFace[]>();
  for (const f of faces) {
    if (f.status !== "assigned" || !f.participantId) continue;
    const list = byParticipant.get(f.participantId) ?? [];
    list.push(f);
    byParticipant.set(f.participantId, list);
  }
  const index = new Map<string, ParticipantFaceInfo>();
  for (const p of participants) {
    const list = byParticipant.get(p.id) ?? [];
    const score = (f: DetectedFace) => f.qualityScore + (roleByPhoto.get(f.photoId) === "portrait" ? 0.25 : 0);
    const ranked = [...list].sort((a, b) => score(b) - score(a));
    const primary = p.primaryFaceId ? list.find((f) => f.id === p.primaryFaceId) : undefined;
    const best = primary ?? ranked[0];
    index.set(p.id, {
      faceUrl: best?.cropDataUrl ?? null,
      faceId: best?.id ?? null,
      faceCount: list.length,
      faces: ranked,
    });
  }
  return index;
}

export function useClassData(classGroupId: string) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [faces, setFaces] = useState<DetectedFace[]>([]);
  const [embeddings, setEmbeddings] = useState<FaceEmbedding[]>([]);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const gen = ++generation.current;
    const [parts, phs, fcs, embs] = await Promise.all([
      localStore.listParticipants(classGroupId),
      localStore.listPhotos(classGroupId),
      localStore.listDetectedFaces(classGroupId),
      localStore.listEmbeddings(classGroupId),
    ]);
    // ignore stale responses when several reloads overlap
    if (gen !== generation.current) return;
    setParticipants(parts);
    setPhotos(phs);
    setFaces(fcs);
    setEmbeddings(embs);
    setLoading(false);
  }, [classGroupId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const faceIndex = useMemo(() => buildFaceIndex(participants, faces, photos), [participants, faces, photos]);

  return { participants, photos, faces, embeddings, faceIndex, loading, reload };
}
