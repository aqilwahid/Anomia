"use client";

import { useCallback, useEffect, useState } from "react";
import { localStore } from "@/store/localStore";
import type { Participant } from "@/domain/participant";
import type { DetectedFace, FaceEmbedding, Photo } from "@/domain/face";

export function useClassData(classGroupId: string) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [faces, setFaces] = useState<DetectedFace[]>([]);
  const [embeddings, setEmbeddings] = useState<FaceEmbedding[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [parts, phs, fcs, embs] = await Promise.all([
      localStore.listParticipants(classGroupId),
      localStore.listPhotos(classGroupId),
      localStore.listDetectedFaces(classGroupId),
      localStore.listEmbeddings(classGroupId),
    ]);
    setParticipants(parts);
    setPhotos(phs);
    setFaces(fcs);
    setEmbeddings(embs);
    setLoading(false);
  }, [classGroupId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  return { participants, photos, faces, embeddings, loading, reload };
}
