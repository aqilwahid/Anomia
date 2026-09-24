"use client";

/* eslint-disable @next/next/no-img-element -- local data URLs */
import type { Photo } from "@/domain/face";
import { useImageAsset } from "./useImageAsset";

function FullAssetThumb({ photo, className }: { photo: Photo; className: string }) {
  const asset = useImageAsset(photo.imageAssetId);
  if (!asset) return <span className={`block bg-surface-container animate-pulse ${className}`} />;
  return <img src={asset.dataUrl} alt={photo.fileName ?? ""} className={`object-cover ${className}`} draggable={false} />;
}

/** Photo preview that uses the stored small thumbnail, falling back to the full image for older photos. */
export function PhotoThumb({ photo, className = "" }: { photo: Photo; className?: string }) {
  if (photo.thumbDataUrl) {
    return <img src={photo.thumbDataUrl} alt={photo.fileName ?? ""} className={`object-cover ${className}`} draggable={false} />;
  }
  return <FullAssetThumb photo={photo} className={className} />;
}
