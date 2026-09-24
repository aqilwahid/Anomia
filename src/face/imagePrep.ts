/**
 * Decode an uploaded photo once and produce:
 * - `work`: a canvas for face detection (EXIF orientation applied, max 3072px)
 * - `stored`: a re-encoded JPEG for IndexedDB (max 2400px). Re-encoding also
 *   strips EXIF metadata such as GPS coordinates (docs/discovery.md §8).
 */

const WORK_MAX_SIDE = 3072;
const STORED_MAX_SIDE = 2400;

export interface PreparedImage {
  work: HTMLCanvasElement;
  stored: { dataUrl: string; width: number; height: number };
  thumbDataUrl: string;
  /** multiply a box in `work` pixels by this to get `stored` pixels */
  workToStored: number;
}

export class UnsupportedImageError extends Error {}

function isHeic(file: File) {
  return /image\/hei(c|f)/i.test(file.type) || /\.hei(c|f)$/i.test(file.name);
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode failed"));
    img.src = src;
  });
}

export function drawScaled(source: CanvasImageSource, width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D tidak tersedia di browser ini");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function prepareImageFile(file: File): Promise<PreparedImage> {
  const url = URL.createObjectURL(file);
  let img: HTMLImageElement;
  try {
    img = await loadImageElement(url);
  } catch {
    URL.revokeObjectURL(url);
    if (isHeic(file)) {
      throw new UnsupportedImageError(
        `${file.name}: format HEIC belum bisa dibaca browser ini. Simpan/ekspor sebagai JPG dulu ` +
          `(iPhone: Pengaturan › Kamera › Format › "Paling Kompatibel").`
      );
    }
    throw new UnsupportedImageError(`${file.name}: file tidak bisa dibaca sebagai gambar.`);
  }
  try {
    // naturalWidth/Height already reflect EXIF orientation in modern browsers
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const work = drawScaled(img, width, height, WORK_MAX_SIDE);
    const storedCanvas =
      Math.max(work.width, work.height) <= STORED_MAX_SIDE
        ? work
        : drawScaled(work, work.width, work.height, STORED_MAX_SIDE);
    const dataUrl = storedCanvas.toDataURL("image/jpeg", 0.86);
    const thumbDataUrl = drawScaled(storedCanvas, storedCanvas.width, storedCanvas.height, 360).toDataURL("image/jpeg", 0.78);
    return {
      work,
      stored: { dataUrl, width: storedCanvas.width, height: storedCanvas.height },
      thumbDataUrl,
      workToStored: storedCanvas.width / work.width,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Load a stored data URL back into a canvas (for manual face marking / rescans). */
export async function canvasFromDataUrl(dataUrl: string): Promise<HTMLCanvasElement> {
  const img = await loadImageElement(dataUrl);
  return drawScaled(img, img.naturalWidth, img.naturalHeight, Number.POSITIVE_INFINITY);
}
