import type { FaceBox } from "@/domain/face";

export interface RawDetectedFace {
  box: FaceBox;
  cropDataUrl: string;
  embedding: number[];
  detectorScore: number;
  qualityScore: number;
}

/**
 * Framework-agnostic face pipeline boundary. The current implementation
 * (see humanPipeline.ts) runs on the main thread via @vladmandic/human;
 * swapping in a Web Worker or a raw ONNX/InsightFace model later should
 * only require a new implementation of this interface.
 */
export interface FacePipeline {
  init(): Promise<void>;
  detect(image: HTMLImageElement): Promise<RawDetectedFace[]>;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
