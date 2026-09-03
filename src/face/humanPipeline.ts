import type { FacePipeline, RawDetectedFace } from "./pipeline";
import { computeBlurVariance, computeQualityScore } from "./quality";

const CROP_SIZE = 160;
const CROP_MARGIN = 0.25;

/**
 * Face pipeline backed by @vladmandic/human, run on the main thread.
 *
 * Docs called for this to live in a Web Worker (see docs/discovery.md,
 * section 6) — deferred for this first pass because Human's default
 * backends assume DOM/canvas access, which OffscreenCanvas-in-worker
 * support varies for across browsers. The interface is worker-ready;
 * only this implementation needs to move.
 */
export class HumanFacePipeline implements FacePipeline {
  private human: InstanceType<typeof import("@vladmandic/human").default> | null = null;

  async init(): Promise<void> {
    if (this.human) return;
    const { default: Human } = await import("@vladmandic/human");
    this.human = new Human({
      modelBasePath: "/models/human/",
      backend: "webgl",
      cacheSensitivity: 0,
      face: {
        enabled: true,
        detector: { enabled: true, rotation: false, maxDetected: 64, minConfidence: 0.2 },
        mesh: { enabled: true },
        iris: { enabled: false },
        description: { enabled: true },
        emotion: { enabled: false },
        antispoof: { enabled: false },
        liveness: { enabled: false },
      },
      body: { enabled: false },
      hand: { enabled: false },
      object: { enabled: false },
      gesture: { enabled: false },
      segmentation: { enabled: false },
    });
    await this.human.load();
    await this.human.warmup();
  }

  async detect(image: HTMLImageElement): Promise<RawDetectedFace[]> {
    if (!this.human) throw new Error("HumanFacePipeline.init() must be called first");

    const result = await this.human.detect(image);

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = image.naturalWidth;
    sourceCanvas.height = image.naturalHeight;
    const sourceCtx = sourceCanvas.getContext("2d");
    if (!sourceCtx) return [];
    sourceCtx.drawImage(image, 0, 0);

    const faces: RawDetectedFace[] = [];

    for (const face of result.face) {
      if (!face.embedding || face.embedding.length === 0) continue;

      const [x, y, width, height] = face.box;
      const marginX = width * CROP_MARGIN;
      const marginY = height * CROP_MARGIN;
      const cropX = Math.max(0, x - marginX);
      const cropY = Math.max(0, y - marginY);
      const cropWidth = Math.min(sourceCanvas.width - cropX, width + marginX * 2);
      const cropHeight = Math.min(sourceCanvas.height - cropY, height + marginY * 2);

      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = CROP_SIZE;
      cropCanvas.height = CROP_SIZE;
      const cropCtx = cropCanvas.getContext("2d");
      if (!cropCtx) continue;
      cropCtx.drawImage(
        sourceCanvas,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        CROP_SIZE,
        CROP_SIZE
      );

      const blurVariance = computeBlurVariance(cropCanvas);
      const qualityScore = computeQualityScore({
        boxWidth: width,
        detectorScore: face.boxScore ?? face.score,
        blurVariance,
      });

      faces.push({
        box: { x, y, width, height },
        cropDataUrl: cropCanvas.toDataURL("image/jpeg", 0.85),
        embedding: normalizeL2(face.embedding),
        detectorScore: face.boxScore ?? face.score,
        qualityScore,
      });
    }

    return faces;
  }
}

function normalizeL2(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vector;
  return vector.map((v) => v / norm);
}
