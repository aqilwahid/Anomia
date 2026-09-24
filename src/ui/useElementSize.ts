"use client";

import { useLayoutEffect, useState } from "react";

/**
 * Size of an element, kept up to date with ResizeObserver. Returns a
 * callback ref (so it also works for elements that mount later, e.g. after
 * a loading skeleton), the size, and the element itself.
 */
export function useElementSize<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize((prev) =>
        Math.abs(prev.width - rect.width) < 0.5 && Math.abs(prev.height - rect.height) < 0.5
          ? prev
          : { width: rect.width, height: rect.height }
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(element);
    return () => ro.disconnect();
  }, [element]);
  return [setElement, size, element] as const;
}
