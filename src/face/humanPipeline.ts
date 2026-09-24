import type { FaceBox } from "@/domain/face";
import type { DetectOptions, FacePipeline, RawDetectedFace } from "./pipeline";
import { computeBlurVariance, computeQualityScore } from "./quality";
import { clampBox, isSameFace, mergeBoxes, tileSizesFor, tilesFor, type ScoredBox } from "./tiling";

type HumanInstance = InstanceType<typeof import("@vladmandic/human").default>;
type HumanConfig = NonNullable<Parameters<HumanInstance["detect"]>[1]>;

const CROP_SIZE = 192;
const CROP_MARGIN = 0.25;
/** tile canvases are downscaled to this before detection — BlazeFace only sees 256×256 anyway */
const TILE_CANVAS = 512;
/** a candidate is re-examined in a crop this many times its box size */
const VERIFY_CONTEXT = 2.2;
/** candidates the verifier cannot confirm are still kept when the detector was this sure */
const KEEP_UNVERIFIED_SCORE = 0.75;

const OFF = { enabled: false } as const;

/**
 * Human merges every per-call config into its instance config permanently,
 * so each call passes a COMPLETE face config — otherwise a detector-only
 * pass would silently leave mesh/description disabled for the next call.
 */
const SCAN_CONFIG: HumanConfig = {
  cacheSensitivity: 0,
  face: {
    enabled: true,
    detector: {
      enabled: true,
      rotation: false,
      maxDetected: 50,
      minConfidence: 0.35,
      iouThreshold: 0.1,
      skipFrames: 0,
      skipTime: 0,
    },
    mesh: OFF,
    iris: OFF,
    description: OFF,
    emotion: OFF,
    antispoof: OFF,
    liveness: OFF,
  },
};

const DESCRIBE_CONFIG: HumanConfig = {
  cacheSensitivity: 0,
  face: {
    enabled: true,
    detector: {
      enabled: true,
      rotation: true,
      maxDetected: 5,
      minConfidence: 0.2,
      iouThreshold: 0.1,
      skipFrames: 0,
      skipTime: 0,
    },
    mesh: { enabled: true },
    iris: OFF,
    description: { enabled: true, skipFrames: 0, skipTime: 0 },
    emotion: OFF,
    antispoof: OFF,
    liveness: OFF,
  },
};

function yieldToUi() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Dibatalkan", "AbortError");
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/**
 * Draw a square region of `source` (may extend past the image edges) into a
 * canvas of `canvasSize`, padding with black. Returns the canvas and the
 * factor that maps canvas pixels back to source pixels.
 */
function squareRegion(source: HTMLCanvasElement, x: number, y: number, size: number, canvasSize: number) {
  const canvas = makeCanvas(canvasSize, canvasSize);
  const ctx = canvas.getContext("2d");
  const scale = canvasSize / size;
  if (ctx) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvasSize, canvasSize);
    const sx = Math.max(0, x);
    const sy = Math.max(0, y);
    const sw = Math.min(source.width, x + size) - sx;
    const sh = Math.min(source.height, y + size) - sy;
    if (sw > 0 && sh > 0) {
      ctx.drawImage(source, sx, sy, sw, sh, (sx - x) * scale, (sy - y) * scale, sw * scale, sh * scale);
    }
  }
  return { canvas, toSource: 1 / scale };
}

function normalizeL2(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vector;
  return vector.map((v) => v / norm);
}

function renderCrop(source: HTMLCanvasElement, box: FaceBox) {
  const side = Math.max(box.width, box.height) * (1 + CROP_MARGIN * 2);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const { canvas } = squareRegion(source, cx - side / 2, cy - side / 2, side, CROP_SIZE);
  return canvas;
}

export class HumanFacePipeline implements FacePipeline {
  private human: HumanInstance | null = null;
  private loading: Promise<void> | null = null;
  /**
   * Human keeps ONE mutable config per instance and re-reads it after every
   * await, so two detections running at once (an upload plus a rescan)
   * would clobber each other's settings. All work goes through this queue.
   */
  private queue: Promise<unknown> = Promise.resolve();

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  async init(): Promise<void> {
    if (this.human) return;
    if (!this.loading) {
      this.loading = (async () => {
        const { default: Human } = await import("@vladmandic/human");
        const base: HumanConfig = {
          modelBasePath: "/models/human/",
          backend: "webgl",
          warmup: "none",
          debug: false,
          ...SCAN_CONFIG,
          body: OFF,
          hand: OFF,
          object: OFF,
          gesture: OFF,
          segmentation: OFF,
        };
        let human = new Human(base);
        try {
          await human.load();
        } catch (err) {
          // WebGL not available (old GPU / disabled): fall back to the slow-but-safe CPU backend
          console.warn("Anomia: WebGL backend failed, falling back to CPU", err);
          human = new Human({ ...base, backend: "cpu" });
          await human.load();
        }
        this.human = human;
      })().catch((err) => {
        this.loading = null;
        throw err;
      });
    }
    await this.loading;
  }

  private get instance(): HumanInstance {
    if (!this.human) throw new Error("HumanFacePipeline.init() must be called first");
    return this.human;
  }

  /** Stage 1: cheap detector-only passes over multi-scale tiles. */
  private async scan(source: HTMLCanvasElement, options: DetectOptions): Promise<ScoredBox[]> {
    const { width, height } = source;
    const tiles = tileSizesFor(width, height, options.depth).flatMap((size) => tilesFor(width, height, size));
    const candidates: ScoredBox[] = [];
    for (let i = 0; i < tiles.length; i++) {
      checkAborted(options.signal);
      options.onProgress?.({ phase: "scan", done: i, total: tiles.length });
      const tile = tiles[i];
      const canvasSize = Math.min(TILE_CANVAS, tile.size);
      const { canvas, toSource } = squareRegion(source, tile.x, tile.y, tile.size, canvasSize);
      const result = await this.instance.detect(canvas, SCAN_CONFIG);
      for (const face of result.face) {
        const [bx, by, bw, bh] = face.box;
        const box = clampBox(
          { x: tile.x + bx * toSource, y: tile.y + by * toSource, width: bw * toSource, height: bh * toSource },
          width,
          height
        );
        // ignore slivers cut by the tile edge; the neighbouring tile sees the whole face
        if (box.width < 12 || box.height < 12) continue;
        candidates.push({ ...box, score: face.boxScore ?? face.score });
      }
      await yieldToUi();
    }
    options.onProgress?.({ phase: "scan", done: tiles.length, total: tiles.length });
    return mergeBoxes(candidates);
  }

  /**
   * Stage 2: look at each candidate again in a zoomed-in crop with the full
   * pipeline (mesh + descriptor). This both rejects detector false positives
   * (patterns on clothes, lamps) and yields a descriptor from a crop at
   * useful resolution.
   */
  private async verify(
    source: HTMLCanvasElement,
    box: FaceBox
  ): Promise<{ box: FaceBox; embedding: number[] | null; score: number } | null> {
    const side = Math.max(box.width, box.height) * VERIFY_CONTEXT;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const canvasSize = Math.round(Math.min(512, Math.max(256, side)));
    const originX = cx - side / 2;
    const originY = cy - side / 2;
    const { canvas, toSource } = squareRegion(source, originX, originY, side, canvasSize);
    const result = await this.instance.detect(canvas, DESCRIBE_CONFIG);

    let best: (typeof result.face)[number] | null = null;
    let bestDistance = Infinity;
    for (const face of result.face) {
      const [bx, by, bw, bh] = face.box;
      const distance = Math.hypot(bx + bw / 2 - canvasSize / 2, by + bh / 2 - canvasSize / 2) / canvasSize;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = face;
      }
    }
    if (!best || bestDistance > 0.25) return null;
    const [bx, by, bw, bh] = best.box;
    return {
      box: clampBox(
        { x: originX + bx * toSource, y: originY + by * toSource, width: bw * toSource, height: bh * toSource },
        source.width,
        source.height
      ),
      embedding: best.embedding && best.embedding.length > 0 ? normalizeL2(best.embedding) : null,
      score: best.boxScore ?? best.score,
    };
  }

  private toRaw(source: HTMLCanvasElement, box: FaceBox, embedding: number[] | null, detectorScore: number): RawDetectedFace {
    const crop = renderCrop(source, box);
    const blurVariance = computeBlurVariance(crop);
    return {
      box,
      cropDataUrl: crop.toDataURL("image/jpeg", 0.88),
      embedding,
      detectorScore,
      qualityScore: computeQualityScore({ boxWidth: box.width, detectorScore, blurVariance }),
    };
  }

  async detect(source: HTMLCanvasElement, options: DetectOptions = {}): Promise<RawDetectedFace[]> {
    await this.init();
    return this.exclusive(() => this.detectNow(source, options));
  }

  private async detectNow(source: HTMLCanvasElement, options: DetectOptions): Promise<RawDetectedFace[]> {
    checkAborted(options.signal);
    let candidates = await this.scan(source, options);
    if (options.exclude?.length) {
      candidates = candidates.filter((c) => !options.exclude!.some((e) => isSameFace(e, c)));
    }

    const faces: RawDetectedFace[] = [];
    const acceptedBoxes: FaceBox[] = [];
    for (let i = 0; i < candidates.length; i++) {
      checkAborted(options.signal);
      options.onProgress?.({ phase: "describe", done: i, total: candidates.length });
      const candidate = candidates[i];
      const verified = await this.verify(source, candidate);
      let face: RawDetectedFace | null = null;
      if (verified) {
        face = this.toRaw(source, verified.box, verified.embedding, Math.max(candidate.score, verified.score));
      } else if (candidate.score >= KEEP_UNVERIFIED_SCORE) {
        face = this.toRaw(source, candidate, null, candidate.score);
      }
      // two candidates can converge on the same face after verification
      if (face && !acceptedBoxes.some((b) => isSameFace(b, face!.box))) {
        faces.push(face);
        acceptedBoxes.push(face.box);
      }
      await yieldToUi();
    }
    options.onProgress?.({ phase: "describe", done: candidates.length, total: candidates.length });
    // reading order: top-to-bottom rows, then left-to-right
    return faces.sort((a, b) => {
      const rowA = Math.round(a.box.y / Math.max(40, a.box.height));
      const rowB = Math.round(b.box.y / Math.max(40, b.box.height));
      return rowA - rowB || a.box.x - b.box.x;
    });
  }

  async describeRegion(source: HTMLCanvasElement, box: FaceBox): Promise<RawDetectedFace> {
    await this.init();
    return this.exclusive(async () => {
      const clamped = clampBox(box, source.width, source.height);
      const verified = await this.verify(source, clamped);
      // keep the instructor's box — they drew it on purpose — but borrow the descriptor if one was found
      return this.toRaw(source, clamped, verified?.embedding ?? null, verified?.score ?? 0);
    });
  }
}
