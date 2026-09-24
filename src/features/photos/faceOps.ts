"use client";

import type { DetectedFace, FaceBox, PhotoRole } from "@/domain/face";
import type { DetectProgress, RawDetectedFace } from "@/face/pipeline";
import { getFacePipeline, MODEL_NAME, MODEL_VERSION } from "@/face/pipelineInstance";
import { canvasFromDataUrl, prepareImageFile } from "@/face/imagePrep";
import { scaleBox } from "@/face/tiling";
import { localStore } from "@/store/localStore";
import type { NewFaceInput } from "@/store/store";

function toFaceInput(raw: RawDetectedFace, factor: number, source: "auto" | "manual"): NewFaceInput {
  return {
    face: {
      box: scaleBox(raw.box, factor),
      cropDataUrl: raw.cropDataUrl,
      detectorScore: raw.detectorScore,
      qualityScore: raw.qualityScore,
      status: "unlabeled",
      participantId: null,
      source,
    },
    embedding: raw.embedding,
    modelName: MODEL_NAME,
    modelVersion: MODEL_VERSION,
  };
}

export async function uploadPhoto(
  file: File,
  classGroupId: string,
  role: PhotoRole,
  onProgress?: (p: DetectProgress) => void,
  signal?: AbortSignal
) {
  const prepared = await prepareImageFile(file);
  const pipeline = await getFacePipeline();
  const raw = await pipeline.detect(prepared.work, { onProgress, signal });
  const photo = await localStore.addPhotoWithFaces({
    classGroupId,
    dataUrl: prepared.stored.dataUrl,
    width: prepared.stored.width,
    height: prepared.stored.height,
    role,
    fileName: file.name,
    thumbDataUrl: prepared.thumbDataUrl,
    faces: raw.map((f) => toFaceInput(f, prepared.workToStored, "auto")),
  });
  return { photo, faceCount: raw.length };
}

async function storedCanvas(photoId: string) {
  const photo = await localStore.getPhoto(photoId);
  if (!photo) throw new Error("Foto tidak ditemukan");
  const asset = await localStore.getImageAsset(photo.imageAssetId);
  if (!asset) throw new Error("File foto tidak ditemukan");
  return canvasFromDataUrl(asset.dataUrl);
}

/** Scan a stored photo again with a finer pass and add only faces that are not there yet. */
export async function rescanPhoto(
  photoId: string,
  existing: DetectedFace[],
  onProgress?: (p: DetectProgress) => void
) {
  const canvas = await storedCanvas(photoId);
  const pipeline = await getFacePipeline();
  const raw = await pipeline.detect(canvas, {
    depth: "deep",
    exclude: existing.filter((f) => f.photoId === photoId).map((f) => f.box),
    onProgress,
  });
  const added = await localStore.addFacesToPhoto(photoId, raw.map((f) => toFaceInput(f, 1, "auto")));
  return added;
}

/** A face the detector missed, marked by the instructor (box in stored-image pixels). */
export async function addManualFace(photoId: string, box: FaceBox) {
  const canvas = await storedCanvas(photoId);
  const pipeline = await getFacePipeline();
  const raw = await pipeline.describeRegion(canvas, box);
  const [face] = await localStore.addFacesToPhoto(photoId, [toFaceInput(raw, 1, "manual")]);
  return { face, hasDescriptor: !!raw.embedding };
}
