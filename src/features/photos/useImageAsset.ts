"use client";

import { useEffect, useState } from "react";
import type { ImageAsset } from "@/domain/face";
import { localStore } from "@/store/localStore";

// Photos are immutable once stored, so a per-tab cache is safe and avoids
// re-reading multi-megabyte data URLs from IndexedDB on every selection change.
const cache = new Map<string, ImageAsset>();
const MAX_CACHED = 24;

export function useImageAsset(assetId: string | null | undefined) {
  const [asset, setAsset] = useState<ImageAsset | null | undefined>(() =>
    assetId ? (cache.get(assetId) ?? undefined) : null
  );

  useEffect(() => {
    let cancelled = false;
    if (!assetId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the photo is cleared
      setAsset(null);
      return;
    }
    const hit = cache.get(assetId);
    if (hit) {
      setAsset(hit);
      return;
    }
    setAsset(undefined);
    localStore.getImageAsset(assetId).then((a) => {
      if (cancelled) return;
      if (a) {
        cache.set(assetId, a);
        if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
      }
      setAsset(a ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return asset;
}
