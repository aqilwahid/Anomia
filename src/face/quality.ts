/**
 * Cheap blur estimate: variance of a Laplacian-like edge filter over a
 * downscaled grayscale version of the crop. Low variance = flat/blurry.
 * Not calibrated against real photos yet — thresholds must be tuned once
 * real training photos are available (see docs/discovery.md, Fase 0).
 */
export function computeBlurVariance(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;

  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);

  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const lap: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const value =
        4 * gray[idx] -
        gray[idx - 1] -
        gray[idx + 1] -
        gray[idx - width] -
        gray[idx + width];
      lap.push(value);
    }
  }

  if (lap.length === 0) return 0;
  const mean = lap.reduce((sum, v) => sum + v, 0) / lap.length;
  const variance = lap.reduce((sum, v) => sum + (v - mean) ** 2, 0) / lap.length;
  return variance;
}

export interface QualityInputs {
  boxWidth: number;
  detectorScore: number;
  blurVariance: number;
}

/**
 * Rough 0-1 quality score combining face size, detector confidence, and
 * blur. This is a starting heuristic, not a calibrated model — validate
 * and retune against real photos before trusting it for auto-filtering.
 */
export function computeQualityScore({ boxWidth, detectorScore, blurVariance }: QualityInputs): number {
  const sizeScore = Math.min(1, boxWidth / 120);
  const blurScore = Math.min(1, blurVariance / 500);
  return Math.max(0, Math.min(1, 0.4 * sizeScore + 0.3 * detectorScore + 0.3 * blurScore));
}
