import type { FaceBox } from "@/domain/face";

/**
 * Pure helpers for tiled face detection. BlazeFace (the detector inside
 * @vladmandic/human) squashes the WHOLE input to 256×256 before looking for
 * faces, so in a 30-person class photo every face ends up only a few pixels
 * wide and gets missed. Scanning overlapping square tiles at a few scales keeps
 * small faces large enough for the detector; duplicates from overlapping tiles
 * are merged with non-maximum suppression.
 */

export interface Tile {
  x: number;
  y: number;
  size: number;
}

export interface ScoredBox extends FaceBox {
  score: number;
}

export type ScanDepth = "normal" | "deep";

/** Square tile sizes to scan, largest first. */
export function tileSizesFor(width: number, height: number, depth: ScanDepth = "normal"): number[] {
  const maxSide = Math.max(width, height);
  const minTile = depth === "deep" ? Math.max(360, maxSide / 7) : Math.max(480, maxSide / 4.5);
  const sizes = [maxSide];
  let next = maxSide / 2;
  while (next > minTile * 1.3) {
    sizes.push(next);
    next /= 2;
  }
  const last = sizes[sizes.length - 1];
  if (last / minTile > 1.3) sizes.push(minTile);
  return sizes.map((s) => Math.round(s));
}

/** Overlapping square tiles covering the image. A tile larger than the image is anchored at 0,0 (padded). */
export function tilesFor(width: number, height: number, size: number, overlap = 0.25): Tile[] {
  const step = Math.max(1, size * (1 - overlap));
  const positions = (extent: number) => {
    if (size >= extent) return [0];
    const count = Math.ceil((extent - size) / step) + 1;
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push(Math.round(Math.min(extent - size, i * step)));
    return Array.from(new Set(out));
  };
  const tiles: Tile[] = [];
  for (const y of positions(height)) {
    for (const x of positions(width)) tiles.push({ x, y, size });
  }
  return tiles;
}

export function intersectionArea(a: FaceBox, b: FaceBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

export function iou(a: FaceBox, b: FaceBox): number {
  const inter = intersectionArea(a, b);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

/** Share of the smaller box that is covered by the other one (catches a box nested inside another). */
export function overlapOfSmaller(a: FaceBox, b: FaceBox): number {
  const inter = intersectionArea(a, b);
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  return smaller > 0 ? inter / smaller : 0;
}

export function isSameFace(a: FaceBox, b: FaceBox): boolean {
  return iou(a, b) > 0.3 || overlapOfSmaller(a, b) > 0.6;
}

/** Greedy NMS: keep the highest-scoring box of every overlapping group. */
export function mergeBoxes<T extends ScoredBox>(boxes: T[]): T[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept: T[] = [];
  for (const box of sorted) {
    if (kept.some((k) => isSameFace(k, box))) continue;
    kept.push(box);
  }
  return kept;
}

/** Intersect a box with the image rectangle (a face cut off by the border keeps only its visible part). */
export function clampBox(box: FaceBox, width: number, height: number): FaceBox {
  const x1 = Math.max(0, Math.min(width - 1, box.x));
  const y1 = Math.max(0, Math.min(height - 1, box.y));
  const x2 = Math.min(width, box.x + box.width);
  const y2 = Math.min(height, box.y + box.height);
  return { x: x1, y: y1, width: Math.max(1, x2 - x1), height: Math.max(1, y2 - y1) };
}

export function scaleBox(box: FaceBox, factor: number): FaceBox {
  return { x: box.x * factor, y: box.y * factor, width: box.width * factor, height: box.height * factor };
}
