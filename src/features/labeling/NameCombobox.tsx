"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import type { Participant } from "@/domain/participant";
import { Avatar } from "@/ui/Avatar";
import type { ParticipantFaceInfo } from "@/features/classes/useClassData";

export type ComboPick = { kind: "existing"; participant: Participant } | { kind: "new"; name: string };

export interface NameComboboxHandle {
  focus: () => void;
}

function fold(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export const NameCombobox = forwardRef<
  NameComboboxHandle,
  {
    participants: Participant[];
    faceIndex: Map<string, ParticipantFaceInfo>;
    value: string;
    onChange: (value: string) => void;
    onPick: (pick: ComboPick) => void;
    /** participants that cannot be chosen (e.g. already appear in the same photo) with the reason */
    blocked?: Map<string, string>;
    /** participant currently linked (edit mode) — shown but not selectable */
    currentId?: string | null;
    placeholder?: string;
    disabled?: boolean;
    /** while the box is empty: ←/→ move to the previous/next face, Ctrl+Z undoes the last action */
    onEmptyKey?: (key: "prev" | "next" | "undo") => void;
    /** a previous pick is still being saved: keep the list open and ignore Enter until it's done */
    busy?: boolean;
  }
>(function NameCombobox(
  { participants, faceIndex, value, onChange, onPick, blocked, currentId, placeholder, disabled, onEmptyKey, busy },
  ref
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // until the user moves through the list, the highlight is chosen automatically
  const [navigated, setNavigated] = useState(false);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  const options = useMemo(() => {
    const q = fold(value);
    const scored = participants
      .filter((p) => p.id !== currentId)
      .map((p) => {
        const name = fold(p.displayName);
        const org = fold(p.organization ?? "");
        let rank = -1;
        if (!q) rank = 3;
        else if (name === q) rank = 0;
        else if (name.startsWith(q) || name.split(/\s+/).some((w) => w.startsWith(q))) rank = 1;
        else if (name.includes(q) || org.includes(q)) rank = 2;
        return { p, rank, hasFace: (faceIndex.get(p.id)?.faceCount ?? 0) > 0 };
      })
      .filter((o) => o.rank >= 0)
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          Number(a.hasFace) - Number(b.hasFace) ||
          a.p.displayName.localeCompare(b.p.displayName, "id")
      );
    const exact = scored.some((o) => o.rank === 0);
    const items: Array<{
      key: string;
      pick: ComboPick;
      p?: Participant;
      hasFace?: boolean;
      blockedReason?: string;
      strong?: boolean;
    }> = scored.slice(0, 50).map((o) => ({
      key: o.p.id,
      pick: { kind: "existing", participant: o.p },
      p: o.p,
      hasFace: o.hasFace,
      blockedReason: blocked?.get(o.p.id),
      strong: o.rank <= 1,
    }));
    if (value.trim() && !exact) {
      items.push({ key: "__new", pick: { kind: "new", name: value.trim() } });
    }
    return items;
  }, [participants, faceIndex, value, blocked, currentId]);

  // First selectable option is highlighted by default — except when the typed name matches
  // someone who can't be picked here (already named in this photo): then Enter must not
  // silently create a duplicate "new participant"; the instructor has to choose explicitly.
  const firstSelectable = options.findIndex((o) => !o.blockedReason);
  const blockedStrongMatch = options.some((o) => o.blockedReason && o.strong);
  const defaultIndex =
    firstSelectable >= 0 && options[firstSelectable].pick.kind === "new" && blockedStrongMatch ? -1 : firstSelectable;
  const active = !open
    ? -1
    : navigated && options[highlight] && !options[highlight].blockedReason
      ? highlight
      : defaultIndex;

  useEffect(() => {
    if (active < 0 || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function move(delta: number) {
    if (options.length === 0) return;
    let i = active < 0 ? (delta > 0 ? -1 : options.length) : active;
    for (let step = 0; step < options.length; step++) {
      i = (i + delta + options.length) % options.length;
      if (!options[i].blockedReason) {
        setNavigated(true);
        setHighlight(i);
        return;
      }
    }
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.blockedReason || busy) return;
    setOpen(false);
    onPick(option.pick);
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none" aria-hidden />
        <input
          ref={inputRef}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setHighlight(0);
            setNavigated(false);
          }}
          onClick={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (!value && onEmptyKey) {
              if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
                e.preventDefault();
                onEmptyKey("undo");
                return;
              }
              if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !e.altKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                setOpen(false);
                onEmptyKey(e.key === "ArrowRight" ? "next" : "prev");
                return;
              }
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              move(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              move(-1);
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (!value.trim() && !open) return;
              if (active >= 0) choose(active);
            } else if (e.key === "Escape") {
              e.stopPropagation();
              if (open) setOpen(false);
              else onChange("");
            }
          }}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          placeholder={placeholder ?? "Ketik nama peserta…"}
          autoComplete="off"
          spellCheck={false}
          className="w-full h-11 pl-9 pr-3 bg-surface-slate border border-border-subtle rounded-lg text-on-surface font-body-md text-body-md placeholder:text-outline focus:bg-surface-card focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/30 disabled:opacity-50"
        />
      </div>
      {open && options.length > 0 && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border border-border-subtle bg-surface-card shadow-xl p-1 animate-fade-in"
        >
          {options.map((o, i) => {
            const selected = i === active;
            if (o.pick.kind === "new") {
              return (
                <li
                  key={o.key}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(i)}
                  onMouseEnter={() => {
                    setNavigated(true);
                    setHighlight(i);
                  }}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer ${
                    selected ? "bg-surface-container-low" : ""
                  }`}
                >
                  <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <UserPlus size={16} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-label-lg font-label-lg text-primary truncate">
                      Tambah peserta baru “{o.pick.name}”
                    </span>
                    <span className="block text-body-sm text-on-surface-variant">Belum ada di daftar peserta</span>
                  </span>
                </li>
              );
            }
            const p = o.p!;
            const info = faceIndex.get(p.id);
            return (
              <li
                key={o.key}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={selected}
                aria-disabled={!!o.blockedReason}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
                onMouseEnter={() => {
                  if (o.blockedReason) return;
                  setNavigated(true);
                  setHighlight(i);
                }}
                className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg ${
                  o.blockedReason ? "opacity-45 cursor-not-allowed" : "cursor-pointer"
                } ${selected ? "bg-surface-container-low" : ""}`}
                title={o.blockedReason}
              >
                <Avatar src={info?.faceUrl} name={p.displayName} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block text-label-lg font-label-lg text-on-surface truncate">{p.displayName}</span>
                  <span className="block text-body-sm text-on-surface-variant truncate">
                    {o.blockedReason ?? [p.organization, p.jobTitle].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-label-sm font-label-sm ${
                    o.hasFace ? "bg-surface-container text-on-surface-variant" : "bg-confidence-medium/15 text-[#b45309]"
                  }`}
                >
                  {o.hasFace ? `${info?.faceCount} wajah` : "belum ada wajah"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});
