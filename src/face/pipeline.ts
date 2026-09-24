import type { FaceBox } from "@/domain/face";
import type { ScanDepth } from "./tiling";

export interface RawDetectedFace {
  /** box in the pixel space of the canvas passed to detect() */
  box: FaceBox;
  cropDataUrl: string;
  /** null when the description model could not produce a descriptor for this face */
  embedding: number[] | null;
  detectorScore: number;
  qualityScore: number;
}

export interface DetectProgress {
  phase: "scan" | "describe";
  done: number;
  total: number;
}

export interface DetectOptions {
  /** "deep" adds a finer tile scale — slower, catches very small faces (used by "Pindai ulang") */
  depth?: ScanDepth;
  /** faces that already exist (same pixel space) — candidates overlapping them are skipped */
  exclude?: FaceBox[];
  onProgress?: (progress: DetectProgress) => void;
  signal?: AbortSignal;
}

/**
 * Framework-agnostic face pipeline boundary. The current implementation
 * (see humanPipeline.ts) runs on the main thread via @vladmandic/human;
 * swapping in a Web Worker or a raw ONNX/InsightFace model later should
 * only require a new implementation of this interface.
 */
export interface FacePipeline {
  init(): Promise<void>;
  detect(image: HTMLCanvasElement, options?: DetectOptions): Promise<RawDetectedFace[]>;
  /** Describe a face inside a box drawn by the instructor (detector missed it). */
  describeRegion(image: HTMLCanvasElement, box: FaceBox): Promise<RawDetectedFace>;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
