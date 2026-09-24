/* eslint-disable @next/next/no-img-element -- face crops are local data URLs, next/image adds nothing here */

const PALETTE = ["#dbe1ff", "#e1e0ff", "#cce5ff", "#d7f5e8", "#ffe7c2", "#ffdcd6", "#efe0ff"];

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function colorFor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function Avatar({
  src,
  name,
  size = 40,
  shape = "circle",
  className = "",
  ring,
}: {
  src?: string | null;
  name: string;
  size?: number;
  shape?: "circle" | "rounded";
  className?: string;
  /** tailwind ring color class, e.g. "ring-primary" */
  ring?: string;
}) {
  const radius = shape === "circle" ? "rounded-full" : "rounded-xl";
  const ringClass = ring ? `ring-2 ring-offset-1 ring-offset-surface-card ${ring}` : "";
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden ${radius} ${ringClass} ${className}`}
      style={{ width: size, height: size, background: src ? "#e2e8f0" : colorFor(name) }}
    >
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover" draggable={false} />
      ) : (
        <span
          className="font-label-md text-on-primary-fixed-variant"
          style={{ fontSize: Math.max(10, size * 0.36), lineHeight: 1 }}
          aria-label={name}
        >
          {initialsOf(name)}
        </span>
      )}
    </span>
  );
}
