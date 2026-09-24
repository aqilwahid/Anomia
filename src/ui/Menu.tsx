"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

export interface MenuItem {
  label: string;
  description?: string;
  icon?: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/** Small dropdown menu: a trigger render-prop plus a list of actions. */
export function Menu({
  trigger,
  items,
  align = "left",
  width = 240,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          role="menu"
          className={`absolute top-full mt-1 z-50 rounded-xl border border-border-subtle bg-surface-card shadow-xl p-1 animate-fade-in ${
            align === "right" ? "right-0" : "left-0"
          }`}
          style={{ width }}
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left disabled:opacity-40 disabled:cursor-not-allowed ${
                  item.danger ? "text-error hover:bg-error-container/50" : "text-on-surface hover:bg-surface-slate"
                }`}
              >
                {Icon && <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />}
                <span className="min-w-0">
                  <span className="block text-label-lg font-label-lg">{item.label}</span>
                  {item.description && <span className="block text-body-sm text-on-surface-variant">{item.description}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
