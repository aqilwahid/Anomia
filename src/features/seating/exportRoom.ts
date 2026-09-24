"use client";

const SVG_NS = "http://www.w3.org/2000/svg";
const FONT_URL = "/fonts/inter-latin-wght.woff2";
const MAX_CANVAS_SIDE = 4096;

let fontCssPromise: Promise<string> | null = null;

/** Inter as a data: URL @font-face, so text in the exported image doesn't fall back to a random system font. */
function embeddedFontCss(): Promise<string> {
  if (!fontCssPromise) {
    fontCssPromise = fetch(FONT_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`font ${res.status}`);
        return res.blob();
      })
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve(
                `@font-face{font-family:'AnomiaInter';font-weight:100 900;font-style:normal;src:url(${reader.result}) format('woff2');}`
              );
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          })
      )
      .catch((err) => {
        fontCssPromise = null;
        throw err;
      });
  }
  return fontCssPromise;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gagal merender denah"));
    img.src = url;
  });
}

/** Rasterise the room SVG (faces are data: URLs, so the canvas stays untainted). */
export async function svgToPngBlob(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const vb = svg.viewBox.baseVal;
  const width = vb && vb.width ? vb.width : svg.clientWidth;
  const height = vb && vb.height ? vb.height : svg.clientHeight;
  const factor = Math.min(scale, MAX_CANVAS_SIDE / Math.max(width, height));

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(Math.round(width * factor)));
  clone.setAttribute("height", String(Math.round(height * factor)));
  clone.removeAttribute("class");
  clone.removeAttribute("style");
  try {
    const css = await embeddedFontCss();
    const style = document.createElementNS(SVG_NS, "style");
    style.textContent = css;
    clone.insertBefore(style, clone.firstChild);
    clone.setAttribute("style", "--rp-font:'AnomiaInter','Helvetica Neue',Arial,sans-serif");
  } catch {
    // no embedded font: the drawing falls back to Helvetica/Arial
  }

  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = await loadImage(url);
    await img.decode?.().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 60)); // let the embedded font settle
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * factor);
    canvas.height = Math.round(height * factor);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas tidak tersedia");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Gagal membuat gambar"))), "image/png")
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function canShareFiles() {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File([new Blob()], "x.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

/** Native share sheet (WhatsApp, email, …) on devices that support sharing files. */
export async function shareBlob(blob: Blob, fileName: string, title: string) {
  const file = new File([blob], fileName, { type: blob.type });
  await navigator.share({ files: [file], title });
}

export function slugify(text: string) {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "denah"
  );
}
