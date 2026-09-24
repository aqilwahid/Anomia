"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Download,
  Eye,
  EyeOff,
  FileText,
  Lock,
  LockOpen,
  Maximize2,
  MoreHorizontal,
  Move,
  Pencil,
  Plus,
  Printer,
  Share2,
  Trash2,
  Undo2,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { ClassGroup, Participant } from "@/domain/participant";
import type { SeatAssignment, SeatingDay, SeatingTable, TableLayoutTemplate, TableShape } from "@/domain/layout";
import type { AutoAssignStrategy } from "@/store/store";
import { localStore } from "@/store/localStore";
import { notifyDataChanged } from "@/store/events";
import { Button } from "@/ui/Button";
import { Avatar } from "@/ui/Avatar";
import { Menu } from "@/ui/Menu";
import { useConfirm, useToast } from "@/ui/Providers";
import { useElementSize } from "@/ui/useElementSize";
import { useClassData } from "@/features/classes/useClassData";
import { StepFooterNav } from "@/features/classes/StepFooterNav";
import { layoutTemplateMeta } from "@/features/classes/layoutTemplates";
import { ParticipantEditor } from "@/features/participants/ParticipantEditor";
import {
  EDGE,
  FRONT_ZONE,
  clampTableCenter,
  defaultShapeFor,
  parseSeatKey,
  seatKey,
  snap,
  tableBounds,
  type Bounds,
} from "./geometry";
import { generateLayout } from "./templates";
import { RoomPlan, type LabelMode, type SeatOccupant } from "./RoomPlan";
import { SeatPopover } from "./SeatPopover";
import { LayoutPanel } from "./LayoutPanel";
import { PeoplePanel } from "./PeoplePanel";
import { NewDayDialog, RenameDayDialog, type NewDayRequest } from "./DayDialog";
import { canShareFiles, downloadBlob, shareBlob, slugify, svgToPngBlob } from "./exportRoom";

type Mode = "assign" | "layout";

interface UndoEntry {
  id: number;
  label: string;
  dayId: string;
  undo: () => Promise<void>;
}

interface DragState {
  participantId: string;
  from: string | null;
  x: number;
  y: number;
  overSeat: string | null;
  overUnseat: boolean;
}

const DEFAULT_SEATS: Record<TableShape, number> = { round: 6, rect: 8, row: 3, chairs: 6 };

function unionBounds(tables: SeatingTable[]): Bounds | null {
  if (tables.length === 0) return null;
  return tables.map(tableBounds).reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }));
}

function toSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

/** Tables from older versions had no position: lay them out in a grid, keeping ids & seat assignments. */
function arrangeLegacy(tables: SeatingTable[], template: TableLayoutTemplate): { tables: SeatingTable[]; width: number; depth: number } {
  const shaped = tables.map((t) => ({ ...t, shape: t.shape ?? (t.x === undefined ? "round" : defaultShapeFor(template)) }));
  const cellW = 300;
  const cellH = 290;
  const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(shaped.length * 1.5))));
  const placed = shaped.map((t, i) =>
    t.x !== undefined && t.y !== undefined
      ? t
      : { ...t, x: 60 + cellW / 2 + (i % cols) * cellW, y: FRONT_ZONE + 30 + cellH / 2 + Math.floor(i / cols) * cellH, rotation: 0 }
  );
  const b = unionBounds(placed);
  return { tables: placed, width: Math.max(700, (b?.maxX ?? 0) + 60), depth: Math.max(500, (b?.maxY ?? 0) + 60) };
}

export function SeatingStep({ classGroupId }: { classGroupId: string }) {
  const { participants, faceIndex, reload: reloadClass } = useClassData(classGroupId);
  const toast = useToast();
  const confirm = useConfirm();

  const [classGroup, setClassGroup] = useState<ClassGroup | null>(null);
  const [days, setDays] = useState<SeatingDay[]>([]);
  const [activeDayId, setActiveDayId] = useState<string | null>(null);
  const [tables, setTables] = useState<SeatingTable[]>([]);
  const [assignments, setAssignments] = useState<SeatAssignment[]>([]);
  const [loadedDayId, setLoadedDayId] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("assign");
  const [labelMode, setLabelMode] = useState<LabelMode>("name");
  const [zoom, setZoom] = useState(1);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [popover, setPopover] = useState<{ key: string; rect: DOMRect } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [tableDrag, setTableDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [revealedSeat, setRevealedSeat] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [newDayOpen, setNewDayOpen] = useState(false);
  const [renameDay, setRenameDay] = useState<SeatingDay | null>(null);
  const [editing, setEditing] = useState<Participant | null>(null);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);

  // the skeleton is all that renders on the server, so reading window lazily is hydration-safe
  const [viewportHeight, setViewportHeight] = useState(() => (typeof window === "undefined" ? 800 : window.innerHeight));
  useEffect(() => {
    const update = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const svgRef = useRef<SVGSVGElement>(null);
  const printSvgRef = useRef<SVGSVGElement>(null);
  const [canvasRef, canvasSize, canvasEl] = useElementSize<HTMLDivElement>();
  const suppressClick = useRef(false);
  const creatingDay = useRef<Promise<void> | null>(null);

  /* --------------------------------------------------------------- load */

  // Only the visible day may be loaded into state, and only its most recent load wins
  // (e.g. a change on Day 1 that finishes after the user already switched to Day 2).
  const activeDayIdRef = useRef<string | null>(null);
  const loadSeq = useRef(0);
  const loadDay = useCallback(async (dayId: string) => {
    if (dayId !== activeDayIdRef.current) return;
    const seq = ++loadSeq.current;
    const [tbls, asgs] = await Promise.all([localStore.listSeatingTables(dayId), localStore.listSeatAssignments(dayId)]);
    if (seq !== loadSeq.current || dayId !== activeDayIdRef.current) return;
    setTables(tbls);
    setAssignments(asgs);
    setLoadedDayId(dayId);
  }, []);

  const loadDays = useCallback(async () => {
    const cg = (await localStore.getClassGroup(classGroupId)) ?? null;
    setClassGroup(cg);
    if (!cg) return;
    let list = await localStore.listSeatingDays(classGroupId);
    if (list.length === 0) {
      // first visit: build Day 1 from the class's layout template and head count
      if (!creatingDay.current) {
        creatingDay.current = (async () => {
          const people = await localStore.listParticipants(classGroupId);
          const layout = generateLayout(cg.tableLayout, Math.max(people.length, cg.estimatedParticipants ?? 0, 8));
          const day = await localStore.createSeatingDay(classGroupId, "Day 1", cg.tableLayout, {
            roomWidth: layout.roomWidth,
            roomDepth: layout.roomDepth,
          });
          await localStore.replaceDayTables(day.id, layout.tables);
          notifyDataChanged();
        })();
      }
      await creatingDay.current;
      list = await localStore.listSeatingDays(classGroupId);
    }
    setDays(list);
    setActiveDayId((cur) => (cur && list.some((d) => d.id === cur) ? cur : (list[0]?.id ?? null)));
  }, [classGroupId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load from IndexedDB
    loadDays();
  }, [loadDays]);

  useEffect(() => {
    activeDayIdRef.current = activeDayId;
    if (!activeDayId) return;
    loadDay(activeDayId);
  }, [activeDayId, loadDay]);

  const activeDay = days.find((d) => d.id === activeDayId) ?? null;
  const locked = !!activeDay?.locked;

  // migrate tables saved by the old table-card UI (no position / shape yet)
  useEffect(() => {
    if (!activeDay || loadedDayId !== activeDay.id) return;
    const legacy = tables.some((t) => t.x === undefined || t.y === undefined || !t.shape);
    if (!legacy && activeDay.roomWidth && activeDay.roomDepth) return;
    (async () => {
      const arranged = arrangeLegacy(tables, activeDay.layoutTemplate);
      for (const t of arranged.tables) {
        const old = tables.find((o) => o.id === t.id)!;
        if (old.x !== t.x || old.y !== t.y || old.shape !== t.shape) {
          await localStore.updateSeatingTable(t.id, { x: t.x, y: t.y, shape: t.shape, rotation: t.rotation ?? 0 });
        }
      }
      if (!activeDay.roomWidth || !activeDay.roomDepth) {
        await localStore.updateSeatingDay(activeDay.id, { roomWidth: arranged.width, roomDepth: arranged.depth });
        setDays((ds) => ds.map((d) => (d.id === activeDay.id ? { ...d, roomWidth: arranged.width, roomDepth: arranged.depth } : d)));
      }
      await loadDay(activeDay.id);
    })();
  }, [activeDay, tables, loadedDayId, loadDay]);

  /* ------------------------------------------------------------ derived */

  const participantsById = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);
  const tablesById = useMemo(() => new Map(tables.map((t) => [t.id, t])), [tables]);

  const displayTables = useMemo(
    () =>
      tables
        .filter((t) => t.x !== undefined && t.y !== undefined)
        .map((t) => (tableDrag && tableDrag.id === t.id ? { ...t, x: tableDrag.x, y: tableDrag.y } : t)),
    [tables, tableDrag]
  );

  const occupants = useMemo(() => {
    const map = new Map<string, SeatOccupant>();
    for (const a of assignments) {
      const participant = participantsById.get(a.participantId);
      if (!participant) continue;
      map.set(seatKey(a.seatingTableId, a.seatIndex), {
        participant,
        faceUrl: faceIndex.get(participant.id)?.faceUrl ?? null,
      });
    }
    return map;
  }, [assignments, participantsById, faceIndex]);

  const seatOfParticipant = useMemo(() => {
    const map = new Map<string, { key: string; tableName: string; seatNumber: number }>();
    for (const a of assignments) {
      const t = tablesById.get(a.seatingTableId);
      if (!t || !participantsById.has(a.participantId)) continue;
      map.set(a.participantId, { key: seatKey(t.id, a.seatIndex), tableName: t.name, seatNumber: a.seatIndex + 1 });
    }
    return map;
  }, [assignments, tablesById, participantsById]);

  const capacity = tables.reduce((s, t) => s + t.seatCount, 0);
  // Room size comes from the saved size, grown only to fit SAVED tables (not the one being
  // dragged) with the same wall margin the drag clamp uses — so pushing a table against a
  // wall never enlarges the room and the viewBox stays put mid-drag.
  const bounds = useMemo(() => unionBounds(tables.filter((t) => t.x !== undefined && t.y !== undefined)), [tables]);
  const roomWidth = Math.max(activeDay?.roomWidth ?? 900, bounds ? Math.ceil(bounds.maxX + EDGE) : 0);
  const roomDepth = Math.max(activeDay?.roomDepth ?? 700, bounds ? Math.ceil(bounds.maxY + EDGE) : 0);
  const selectedTable = selectedTableId ? (tablesById.get(selectedTableId) ?? null) : null;

  /* ------------------------------------------------------------- undo */

  const undoSeq = useRef(0);
  const pushUndo = useCallback((entry: Omit<UndoEntry, "id">) => {
    const id = ++undoSeq.current;
    setUndoStack((s) => [...s.slice(-29), { ...entry, id }]);
    return id;
  }, []);

  /** Undo the latest change. From a toast (`onlyId`), only if that toast's change is still the latest. */
  const undo = useCallback(async (onlyId?: number) => {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;
    if (onlyId !== undefined && entry.id !== onlyId) {
      toast.show({ message: "Sudah ada perubahan yang lebih baru — pakai tombol Urungkan di atas untuk mundur satu per satu." });
      return;
    }
    setUndoStack((s) => s.slice(0, -1));
    await entry.undo();
    setSelectedTableId(null);
    setPopover(null);
    await loadDays();
    if (entry.dayId === activeDayId) await loadDay(entry.dayId);
    else setActiveDayId(entry.dayId);
    notifyDataChanged();
    toast.show({ message: `Dibatalkan: ${entry.label}` });
  }, [undoStack, activeDayId, loadDay, loadDays, toast]);

  const undoRef = useRef(undo);
  useEffect(() => {
    undoRef.current = undo;
  }, [undo]);
  const undoAction = (id: number) => ({ label: "Urungkan", onClick: () => undoRef.current(id) });

  /** Seat-only change: undo restores the previous assignments (table ids unchanged). */
  async function mutateSeats(label: string, fn: () => Promise<void>, opts: { toast?: boolean } = {}) {
    if (!activeDay || locked) return;
    const dayId = activeDay.id;
    const snapshot = assignments.map((a) => ({ seatingTableId: a.seatingTableId, seatIndex: a.seatIndex, participantId: a.participantId }));
    await fn();
    const id = pushUndo({ label, dayId, undo: () => localStore.setDayAssignments(dayId, snapshot) });
    await loadDay(dayId);
    notifyDataChanged();
    if (opts.toast) toast.show({ message: label, tone: "success", action: undoAction(id) });
  }

  /**
   * Layout change: undo puts the day's tables (same ids), seating and room
   * settings back from a snapshot, so seat-undo entries taken earlier stay valid.
   */
  async function mutateLayout(label: string, fn: () => Promise<void>, opts: { toast?: boolean } = {}) {
    if (!activeDay || locked) return;
    const day = activeDay;
    const snapshot = { tables: tables.map((t) => ({ ...t })), assignments: assignments.map((a) => ({ ...a })) };
    const dayProps = { layoutTemplate: day.layoutTemplate, roomWidth: day.roomWidth, roomDepth: day.roomDepth };
    await fn();
    const id = pushUndo({
      label,
      dayId: day.id,
      undo: async () => {
        await localStore.restoreDaySnapshot(day.id, snapshot);
        await localStore.updateSeatingDay(day.id, dayProps);
      },
    });
    await loadDay(day.id);
    notifyDataChanged();
    if (opts.toast) toast.show({ message: label, tone: "success", action: undoAction(id) });
  }

  /* ---------------------------------------------------------- seating */

  function seatLabel(key: string) {
    const parsed = parseSeatKey(key);
    const t = parsed ? tablesById.get(parsed.tableId) : undefined;
    return t && parsed ? `${t.name} · kursi ${parsed.seatIndex + 1}` : "kursi";
  }

  async function place(participantId: string, key: string) {
    const parsed = parseSeatKey(key);
    if (!parsed) return;
    const p = participantsById.get(participantId);
    const occupant = occupants.get(key);
    const moving = seatOfParticipant.get(participantId);
    const label =
      occupant && occupant.participant.id !== participantId
        ? moving
          ? `${p?.displayName} ⇄ ${occupant.participant.displayName}`
          : `${p?.displayName} menggantikan ${occupant.participant.displayName}`
        : `${p?.displayName} → ${seatLabel(key)}`;
    await mutateSeats(label, () => localStore.assignSeat(parsed.tableId, parsed.seatIndex, participantId), {
      toast: !!occupant,
    });
  }

  async function unseat(participantId: string) {
    if (!activeDay) return;
    const name = participantsById.get(participantId)?.displayName ?? "Peserta";
    await mutateSeats(`${name} dikeluarkan dari kursi`, () => localStore.unassignParticipant(activeDay.id, participantId), { toast: true });
  }

  async function autoAssign(strategy: AutoAssignStrategy) {
    if (!activeDay) return;
    const label = { "mix-org": "Kursi diisi (campur instansi)", random: "Kursi diisi acak", order: "Kursi diisi urut daftar" }[strategy];
    await mutateSeats(label, () => localStore.autoAssignSeats(activeDay.id, strategy), { toast: true });
  }

  async function shuffle() {
    if (!activeDay) return;
    await mutateSeats("Posisi duduk diacak", () => localStore.shuffleSeats(activeDay.id), { toast: true });
  }

  async function clearAll() {
    if (!activeDay) return;
    const ok = await confirm({
      title: "Kosongkan semua kursi?",
      message: `Semua peserta di ${activeDay.label} dikembalikan ke daftar "Belum duduk". Bisa diurungkan.`,
      confirmLabel: "Kosongkan",
      tone: "danger",
    });
    if (!ok) return;
    await mutateSeats("Semua kursi dikosongkan", () => localStore.clearSeats(activeDay.id), { toast: true });
  }

  /* -------------------------------------------------- drag participants */

  function startParticipantDrag(e: React.PointerEvent, participantId: string) {
    {
      if (locked || mode !== "assign" || e.button !== 0) return;
      const from = seatOfParticipant.get(participantId)?.key ?? null;
      const start = { x: e.clientX, y: e.clientY };
      let active = false;
      let over: { seat: string | null; unseat: boolean } = { seat: null, unseat: false };

      const hit = (x: number, y: number) => {
        const el = document.elementFromPoint(x, y);
        const seatEl = el?.closest?.("[data-seat]");
        return { seat: seatEl?.getAttribute("data-seat") ?? null, unseat: !!el?.closest?.("[data-unseat-zone]") };
      };
      const move = (ev: PointerEvent) => {
        if (!active) {
          if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
          active = true;
          setPopover(null);
        }
        ev.preventDefault();
        over = hit(ev.clientX, ev.clientY);
        setDrag({ participantId, from, x: ev.clientX, y: ev.clientY, overSeat: over.seat, overUnseat: over.unseat });
      };
      const finish = (ev: PointerEvent, cancelled: boolean) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        if (!active) return;
        suppressClick.current = true;
        setTimeout(() => (suppressClick.current = false), 0);
        setDrag(null);
        if (cancelled) return;
        const target = hit(ev.clientX, ev.clientY);
        if (target.seat && target.seat !== from) place(participantId, target.seat);
        else if (target.unseat && from) unseat(participantId);
      };
      const up = (ev: PointerEvent) => finish(ev, false);
      const cancel = (ev: PointerEvent) => finish(ev, true);
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
    }
  }

  function openPopover(key: string) {
    const el = svgRef.current?.querySelector(`[data-seat="${CSS.escape(key)}"]`);
    if (!el) return;
    setPopover({ key, rect: el.getBoundingClientRect() });
    setRevealedSeat(null);
  }

  // keep the popover glued to its chair while the page / canvas scrolls or zooms
  useEffect(() => {
    if (!popover) return;
    const raf = requestAnimationFrame(() => {
      const el = svgRef.current?.querySelector(`[data-seat="${CSS.escape(popover.key)}"]`);
      if (el) setPopover((p) => (p ? { ...p, rect: el.getBoundingClientRect() } : p));
    });
    return () => cancelAnimationFrame(raf);
  }, [zoom, canvasSize.width]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!popover) return;
    const update = () => {
      const el = svgRef.current?.querySelector(`[data-seat="${CSS.escape(popover.key)}"]`);
      if (el) setPopover((p) => (p ? { ...p, rect: el.getBoundingClientRect() } : p));
    };
    const canvas = canvasEl;
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    canvas?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      canvas?.removeEventListener("scroll", update);
    };
  }, [popover?.key, canvasEl]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSeatClick(key: string) {
    if (suppressClick.current) return;
    if (picked) {
      const pid = picked;
      setPicked(null);
      place(pid, key);
      return;
    }
    if (labelMode === "hidden" && occupants.has(key) && revealedSeat !== key && popover?.key !== key) {
      // memorisation mode: first tap reveals the name, second tap opens the card
      setRevealedSeat(key);
      return;
    }
    openPopover(key);
  }

  function locate(participantId: string) {
    const where = seatOfParticipant.get(participantId);
    if (!where) return;
    setHighlight(participantId);
    setTimeout(() => setHighlight((h) => (h === participantId ? null : h)), 2500);
    const el = svgRef.current?.querySelector(`[data-seat="${CSS.escape(where.key)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    setTimeout(() => openPopover(where.key), 350);
  }

  /* ------------------------------------------------------ table editing */

  /** commit a field being edited (e.g. the table name) before the selection changes and unmounts it */
  function blurActiveField() {
    const el = document.activeElement as HTMLElement | null;
    if (el && el.closest("input, textarea, select")) el.blur();
  }

  function onTablePointerDown(tableId: string, e: React.PointerEvent<SVGGElement>) {
    if (mode !== "layout" || e.button !== 0) return;
    e.stopPropagation();
    blurActiveField();
    setSelectedTableId(tableId);
    if (locked) return;
    const svg = svgRef.current;
    const table = tablesById.get(tableId);
    if (!svg || !table) return;
    const start = toSvgPoint(svg, e.clientX, e.clientY);
    const origin = { x: table.x ?? 0, y: table.y ?? 0 };
    let last = origin;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const p = toSvgPoint(svg, ev.clientX, ev.clientY);
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      ev.preventDefault();
      last = clampTableCenter(table, snap(origin.x + dx), snap(origin.y + dy), roomWidth, roomDepth);
      setTableDrag({ id: tableId, x: last.x, y: last.y });
    };
    const up = async () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!moved) {
        setTableDrag(null);
        return;
      }
      await mutateLayout(`${table.name} dipindah`, () => localStore.updateSeatingTable(tableId, { x: last.x, y: last.y }));
      setTableDrag(null);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  async function updateTable(tableId: string, patch: Partial<Pick<SeatingTable, "name" | "seatCount" | "shape" | "rotation">>) {
    const t = tablesById.get(tableId);
    if (!t || locked) return;
    if (Object.entries(patch).every(([k, v]) => t[k as keyof SeatingTable] === v)) return; // nothing changed
    if (patch.seatCount !== undefined && patch.seatCount < t.seatCount) {
      const dropped = assignments.filter((a) => a.seatingTableId === t.id && a.seatIndex >= patch.seatCount!);
      if (dropped.length) {
        const ok = await confirm({
          title: "Kurangi kursi?",
          message: `${dropped.map((a) => participantsById.get(a.participantId)?.displayName).filter(Boolean).join(", ")} akan kembali ke daftar belum duduk.`,
          confirmLabel: "Kurangi",
        });
        if (!ok) return;
      }
    }
    let next = { ...t, ...patch };
    const c = clampTableCenter(next, next.x ?? 0, next.y ?? 0, roomWidth, roomDepth);
    next = { ...next, x: c.x, y: c.y };
    const label = patch.name ? "Nama meja diganti" : patch.seatCount !== undefined ? `Kursi ${t.name}: ${patch.seatCount}` : patch.shape ? "Bentuk meja diganti" : `${t.name} diputar`;
    await mutateLayout(label, () =>
      localStore.updateSeatingTable(t.id, { ...patch, x: next.x, y: next.y })
    );
  }

  /**
   * Where a new table goes: the first free spot scanning from the back of the
   * room (where extra tables usually end up). When the room is full, the room
   * is extended at the back and the table is put in the new strip.
   */
  function placeNewTable(draft: SeatingTable): { x: number; y: number; grow: number } {
    const others = displayTables.map(tableBounds);
    for (let y = roomDepth - 60; y >= FRONT_ZONE + 60; y -= 40) {
      for (let x = 80; x < roomWidth - 40; x += 40) {
        const c = clampTableCenter(draft, x, y, roomWidth, roomDepth);
        const b = tableBounds({ ...draft, x: c.x, y: c.y });
        const clash = others.some((o) => !(b.maxX + 12 < o.minX || b.minX - 12 > o.maxX || b.maxY + 12 < o.minY || b.minY - 12 > o.maxY));
        if (!clash) return { ...c, grow: 0 };
      }
    }
    const b = tableBounds({ ...draft, x: 0, y: 0 });
    const grow = Math.ceil((b.maxY - b.minY + 40) / 50) * 50;
    return { x: roomWidth / 2, y: roomDepth + 20 - b.minY, grow };
  }

  async function addTable(shape: TableShape) {
    if (!activeDay || locked) return;
    const count = displayTables.length;
    let n = count + 1;
    const names = new Set(tables.map((t) => t.name));
    while (names.has(`Meja ${n}`)) n++;
    const base: SeatingTable = {
      id: "draft",
      seatingDayId: activeDay.id,
      order: count,
      name: shape === "chairs" ? `Baris ${n}` : `Meja ${n}`,
      shape,
      seatCount: DEFAULT_SEATS[shape],
      x: roomWidth / 2,
      y: roomDepth / 2,
      rotation: 0,
    };
    const spot = placeNewTable(base);
    const dayId = activeDay.id;
    await mutateLayout(`${base.name} ditambahkan`, async () => {
      if (spot.grow) await localStore.updateSeatingDay(dayId, { roomDepth: roomDepth + spot.grow });
      const created = await localStore.createSeatingTable(dayId, { ...base, x: spot.x, y: spot.y });
      setSelectedTableId(created.id);
    });
    if (spot.grow) setDays((ds) => ds.map((d) => (d.id === dayId ? { ...d, roomDepth: roomDepth + spot.grow } : d)));
  }

  async function duplicateSelected() {
    if (!selectedTable || !activeDay || locked) return;
    const t = selectedTable;
    const draft: SeatingTable = { ...t, id: "draft", name: `${t.name} (salinan)` };
    const spot = placeNewTable(draft);
    const dayId = activeDay.id;
    await mutateLayout(`${t.name} diduplikat`, async () => {
      if (spot.grow) await localStore.updateSeatingDay(dayId, { roomDepth: roomDepth + spot.grow });
      const created = await localStore.createSeatingTable(dayId, {
        name: draft.name,
        shape: t.shape,
        seatCount: t.seatCount,
        rotation: t.rotation,
        x: spot.x,
        y: spot.y,
      });
      setSelectedTableId(created.id);
    });
    if (spot.grow) setDays((ds) => ds.map((d) => (d.id === dayId ? { ...d, roomDepth: roomDepth + spot.grow } : d)));
  }

  async function deleteSelected() {
    if (!selectedTable || locked) return;
    const t = selectedTable;
    const seated = assignments.filter((a) => a.seatingTableId === t.id).length;
    if (seated > 0) {
      const ok = await confirm({
        title: `Hapus ${t.name}?`,
        message: `${seated} peserta di meja ini akan kembali ke daftar belum duduk.`,
        confirmLabel: "Hapus meja",
        tone: "danger",
      });
      if (!ok) return;
    }
    setSelectedTableId(null);
    await mutateLayout(`${t.name} dihapus`, () => localStore.deleteSeatingTable(t.id), { toast: true });
  }

  async function applyTemplate(template: TableLayoutTemplate) {
    if (!activeDay || !classGroup || locked) return;
    const meta = layoutTemplateMeta(template);
    const n = Math.max(participants.length, classGroup.estimatedParticipants ?? 0, 4);
    if (tables.length > 0) {
      const ok = await confirm({
        title: `Susun ulang denah jadi ${meta.label}?`,
        message:
          assignments.length > 0
            ? `Semua meja diganti dengan tata letak ${meta.label} untuk ${n} peserta. ${assignments.length} peserta yang sudah duduk ditempatkan ulang secara berurutan. Bisa diurungkan.`
            : `Semua meja diganti dengan tata letak ${meta.label} untuk ${n} peserta. Bisa diurungkan.`,
        confirmLabel: "Susun ulang",
      });
      if (!ok) return;
    }
    const layout = generateLayout(template, n);
    const ordered = [...tables].sort((a, b) => a.order - b.order);
    const seatedInOrder: string[] = [];
    for (const t of ordered) {
      for (let i = 0; i < t.seatCount; i++) {
        const a = assignments.find((x) => x.seatingTableId === t.id && x.seatIndex === i);
        if (a) seatedInOrder.push(a.participantId);
      }
    }
    const seating: Array<{ tableIndex: number; seatIndex: number; participantId: string }> = [];
    let k = 0;
    layout.tables.forEach((t, ti) => {
      for (let si = 0; si < t.seatCount && k < seatedInOrder.length; si++) seating.push({ tableIndex: ti, seatIndex: si, participantId: seatedInOrder[k++] });
    });
    const dayId = activeDay.id;
    setSelectedTableId(null);
    await mutateLayout(
      `Denah disusun ulang: ${meta.label}`,
      async () => {
        await localStore.replaceDayTables(dayId, layout.tables, seating);
        await localStore.updateSeatingDay(dayId, { layoutTemplate: template, roomWidth: layout.roomWidth, roomDepth: layout.roomDepth });
      },
      { toast: true }
    );
    setDays((ds) => ds.map((d) => (d.id === dayId ? { ...d, layoutTemplate: template, roomWidth: layout.roomWidth, roomDepth: layout.roomDepth } : d)));
  }

  async function setRoomSize(width: number, depth: number) {
    if (!activeDay || locked) return;
    const dayId = activeDay.id;
    await mutateLayout("Ukuran ruangan diubah", () => localStore.updateSeatingDay(dayId, { roomWidth: width, roomDepth: depth }));
    setDays((ds) => ds.map((d) => (d.id === dayId ? { ...d, roomWidth: width, roomDepth: depth } : d)));
  }

  /* --------------------------------------------------------------- days */

  async function createDay(req: NewDayRequest) {
    setNewDayOpen(false);
    let created: SeatingDay;
    if (req.kind === "copy") {
      created = await localStore.duplicateSeatingDay(req.sourceDayId, req.label, req.mode);
    } else {
      const layout = generateLayout(req.template, Math.max(participants.length, classGroup?.estimatedParticipants ?? 0, 8));
      created = await localStore.createSeatingDay(classGroupId, req.label, req.template, {
        roomWidth: layout.roomWidth,
        roomDepth: layout.roomDepth,
      });
      await localStore.replaceDayTables(created.id, layout.tables);
    }
    await loadDays();
    setActiveDayId(created.id);
    setSelectedTableId(null);
    notifyDataChanged();
    toast.show({ message: `${created.label} dibuat`, tone: "success" });
  }

  async function toggleLock() {
    if (!activeDay) return;
    const next = !activeDay.locked;
    await localStore.updateSeatingDay(activeDay.id, { locked: next });
    setDays((ds) => ds.map((d) => (d.id === activeDay.id ? { ...d, locked: next } : d)));
    setPicked(null);
    toast.show({ message: next ? `${activeDay.label} dikunci — denah tidak bisa diubah` : `${activeDay.label} dibuka kembali` });
  }

  async function deleteDay(day: SeatingDay) {
    if (days.length <= 1) return;
    const ok = await confirm({
      title: `Hapus ${day.label}?`,
      message: "Denah dan posisi duduk hari ini dihapus. Data peserta dan wajah tidak terpengaruh.",
      confirmLabel: "Hapus sesi",
      tone: "danger",
    });
    if (!ok) return;
    await localStore.deleteSeatingDay(day.id);
    setUndoStack((s) => s.filter((u) => u.dayId !== day.id));
    if (activeDayId === day.id) setActiveDayId(null);
    await loadDays();
    notifyDataChanged();
  }

  async function doRename(label: string) {
    if (!renameDay) return;
    await localStore.updateSeatingDay(renameDay.id, { label });
    setDays((ds) => ds.map((d) => (d.id === renameDay.id ? { ...d, label } : d)));
    setRenameDay(null);
  }

  /* -------------------------------------------------------------- share */

  const exportTitle = classGroup?.name ?? "Denah kelas";
  const exportSubtitle = [activeDay?.label, classGroup?.room, classGroup?.scheduleLabel].filter(Boolean).join(" · ");
  const fileName = `denah-${slugify(`${exportTitle}-${activeDay?.label ?? ""}`)}.png`;

  async function exportPng(share: boolean) {
    const svg = printSvgRef.current;
    if (!svg) return;
    setExporting(true);
    try {
      const blob = await svgToPngBlob(svg, 2);
      if (share && canShareFiles()) {
        try {
          await shareBlob(blob, fileName, `${exportTitle} — ${activeDay?.label ?? ""}`);
        } catch (err) {
          if ((err as DOMException)?.name !== "AbortError") downloadBlob(blob, fileName);
        }
      } else {
        downloadBlob(blob, fileName);
        toast.show({ message: "Gambar denah diunduh", tone: "success" });
      }
    } catch (err) {
      console.error(err);
      toast.show({ message: "Gagal membuat gambar. Gunakan Cetak → Simpan sebagai PDF.", tone: "error" });
    } finally {
      setExporting(false);
    }
  }

  /* ----------------------------------------------------------- keyboard */

  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyHandler.current = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") {
        setPicked(null);
        setPopover(null);
        setSelectedTableId(null);
        return;
      }
      if (mode !== "layout" || !selectedTable || locked || busy) return;
      const step = e.shiftKey ? 50 : 10;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (moves[e.key]) {
        e.preventDefault();
        const [dx, dy] = moves[e.key];
        const c = clampTableCenter(selectedTable, (selectedTable.x ?? 0) + dx, (selectedTable.y ?? 0) + dy, roomWidth, roomDepth);
        setBusy(true);
        mutateLayout(`${selectedTable.name} digeser`, () => localStore.updateSeatingTable(selectedTable.id, { x: c.x, y: c.y })).finally(() =>
          setBusy(false)
        );
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        updateTable(selectedTable.id, { rotation: (((selectedTable.rotation ?? 0) + (e.shiftKey ? -90 : 90)) % 360 + 360) % 360 });
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      }
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ------------------------------------------------------------- render */

  if (!activeDay || loadedDayId !== activeDay.id) {
    return (
      <div className="w-full max-w-[1400px] mx-auto px-layout-gutter-mobile md:px-layout-gutter-desktop py-space-md">
        <div className="h-[520px] rounded-2xl bg-surface-card border border-border-subtle animate-pulse" />
      </div>
    );
  }

  const popoverSeat = popover ? parseSeatKey(popover.key) : null;
  const popoverTable = popoverSeat ? tablesById.get(popoverSeat.tableId) : undefined;
  const popoverOccupant = popover ? (occupants.get(popover.key)?.participant ?? null) : null;
  const dragParticipant = drag ? participantsById.get(drag.participantId) : undefined;
  const pickedParticipant = picked ? participantsById.get(picked) : undefined;
  const seatedCount = seatOfParticipant.size;
  // "100%" = the whole room fits in the visible area (width and height); zoom scales from there
  const fitWidth = Math.min(canvasSize.width || 900, Math.max(380, viewportHeight - 250) * (roomWidth / roomDepth));
  const svgWidth = Math.max(320, fitWidth * zoom);
  const lastUndo = undoStack[undoStack.length - 1];
  const shareSupported = typeof window !== "undefined" && canShareFiles();
  // A4 page orientation follows the room's shape (header + footer add ~200 units)
  const printLandscape = roomWidth >= roomDepth + 200;

  return (
    <div className="w-full max-w-[1400px] mx-auto px-layout-gutter-mobile md:px-layout-gutter-desktop py-space-md">
      {/* ------------------------------------------------ toolbar */}
      <div className="no-print flex flex-col gap-space-sm mb-space-md">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-sm">
          <div>
            <h1 className="font-headline-md text-headline-md text-on-surface">Denah Ruangan</h1>
            <p className="text-body-md text-on-surface-variant">
              {classGroup?.room ? `${classGroup.room} · ` : ""}
              {seatedCount}/{participants.length} peserta sudah duduk · {tables.length} meja · {capacity} kursi
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" icon={Undo2} onClick={() => undo()} disabled={!lastUndo} title={lastUndo ? `Urungkan: ${lastUndo.label}` : undefined}>
              Urungkan
            </Button>
            <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>
              Cetak / PDF
            </Button>
            <Link href={`/classes/${classGroupId}/report`}>
              <Button variant="secondary" size="sm" icon={FileText}>
                Laporan
              </Button>
            </Link>
            <Button variant="secondary" size="sm" icon={Download} onClick={() => exportPng(false)} disabled={exporting}>
              {exporting ? "Menyiapkan…" : "Unduh gambar"}
            </Button>
            {shareSupported && (
              <Button variant="primary" size="sm" icon={Share2} onClick={() => exportPng(true)} disabled={exporting}>
                Bagikan
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 rounded-2xl bg-surface-card border border-border-subtle p-2 shadow-xs">
          <div className="flex items-center gap-1 overflow-x-auto scroll-thin">
            {days.map((d) => {
              const active = d.id === activeDayId;
              return (
                <div key={d.id} className={`flex items-center rounded-lg shrink-0 ${active ? "bg-primary-container text-on-primary" : "hover:bg-surface-slate"}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveDayId(d.id);
                      setSelectedTableId(null);
                      setPopover(null);
                      setPicked(null);
                    }}
                    className={`flex items-center gap-1.5 pl-3 ${active ? "pr-1" : "pr-3"} py-1.5 font-label-md text-label-md ${active ? "" : "text-on-surface-variant"}`}
                  >
                    {d.locked && <Lock size={13} aria-label="terkunci" />}
                    {d.label}
                  </button>
                  {active && (
                    <Menu
                      trigger={({ toggle }) => (
                        <button type="button" onClick={toggle} className="p-1.5 mr-0.5 rounded-md hover:bg-white/15" aria-label={`Menu ${d.label}`}>
                          <MoreHorizontal size={15} />
                        </button>
                      )}
                      items={[
                        { label: "Ganti nama", icon: Pencil, onSelect: () => setRenameDay(d) },
                        { label: d.locked ? "Buka kunci" : "Kunci denah", icon: d.locked ? LockOpen : Lock, onSelect: toggleLock },
                        { label: "Hapus sesi", icon: Trash2, danger: true, disabled: days.length <= 1, onSelect: () => deleteDay(d) },
                      ]}
                    />
                  )}
                </div>
              );
            })}
            <Button variant="ghost" size="sm" icon={Plus} onClick={() => setNewDayOpen(true)} className="shrink-0">
              Tambah hari
            </Button>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div role="radiogroup" aria-label="Mode" className="inline-flex rounded-lg bg-surface-slate p-1 font-label-md text-label-md">
              {(
                [
                  ["assign", Users, "Atur peserta"],
                  ["layout", Move, "Edit denah"],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => {
                    setMode(value);
                    setPopover(null);
                    setPicked(null);
                    if (value === "assign") setSelectedTableId(null);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 ${
                    mode === value ? "bg-surface-card text-primary shadow-xs" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  <Icon size={15} aria-hidden /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {locked && (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-container-low px-3 py-2 text-body-sm text-on-surface">
            <span className="inline-flex items-center gap-2">
              <Lock size={15} className="text-primary" aria-hidden /> {activeDay.label} terkunci — denah & posisi duduk tidak bisa diubah.
            </span>
            <Button variant="soft" size="sm" icon={LockOpen} onClick={toggleLock}>
              Buka kunci
            </Button>
          </div>
        )}
        {pickedParticipant && (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-primary-container text-on-primary px-3 py-2 text-body-md shadow-md animate-pop-in">
            <span className="inline-flex items-center gap-2 min-w-0">
              <Avatar src={faceIndex.get(pickedParticipant.id)?.faceUrl} name={pickedParticipant.displayName} size={28} />
              <span className="truncate">
                Ketuk kursi untuk menempatkan <strong>{pickedParticipant.displayName}</strong>
              </span>
            </span>
            <button type="button" onClick={() => setPicked(null)} className="p-1 rounded-md hover:bg-white/15" aria-label="Batal">
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="no-print grid grid-cols-1 lg:grid-cols-12 gap-space-md items-start">
        {/* ------------------------------------------------ canvas */}
        <section className="min-w-0 lg:col-span-8 xl:col-span-9 rounded-2xl bg-surface-card border border-border-subtle shadow-xs overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-border-subtle">
            <div className="inline-flex rounded-lg bg-surface-slate p-0.5 text-label-md font-label-md" role="radiogroup" aria-label="Label di kursi">
              {(
                [
                  ["name", "Nama"],
                  ["name-org", "Nama + instansi"],
                  ["hidden", "Mode hafalan"],
                ] as Array<[LabelMode, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={labelMode === value}
                  onClick={() => {
                    setLabelMode(value);
                    setRevealedSeat(null);
                  }}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 ${labelMode === value ? "bg-surface-card text-primary shadow-xs" : "text-on-surface-variant"}`}
                  title={value === "hidden" ? "Sembunyikan nama untuk latihan menghafal — ketuk kursi untuk mengintip" : undefined}
                >
                  {value === "hidden" && (labelMode === "hidden" ? <EyeOff size={13} aria-hidden /> : <Eye size={13} aria-hidden />)}
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" iconOnly icon={ZoomOut} onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(2)))} disabled={zoom <= 0.6}>
                Perkecil
              </Button>
              <button type="button" onClick={() => setZoom(1)} className="min-w-[52px] text-center text-label-md font-label-md text-on-surface-variant hover:text-on-surface" title="Sesuaikan lebar">
                {Math.round(zoom * 100)}%
              </button>
              <Button variant="ghost" size="sm" iconOnly icon={ZoomIn} onClick={() => setZoom((z) => Math.min(2.6, +(z + 0.2).toFixed(2)))} disabled={zoom >= 2.6}>
                Perbesar
              </Button>
              <Button variant="ghost" size="sm" iconOnly icon={Maximize2} onClick={() => setZoom(1)}>
                Sesuaikan layar
              </Button>
            </div>
          </div>
          <div ref={canvasRef} className="relative overflow-auto bg-surface-slate" style={{ maxHeight: "calc(100vh - 150px)" }}>
            <RoomPlan
              svgRef={svgRef}
              roomWidth={roomWidth}
              roomDepth={roomDepth}
              tables={displayTables}
              occupants={occupants}
              mode={mode}
              labelMode={labelMode}
              selectedTableId={mode === "layout" ? selectedTableId : null}
              selectedSeatKey={popover?.key ?? null}
              dropTargetKey={drag?.overSeat && drag.overSeat !== drag.from ? drag.overSeat : null}
              draggingParticipantId={drag?.participantId ?? null}
              highlightParticipantId={highlight}
              revealedSeatKey={revealedSeat}
              pickedParticipantId={picked}
              onSeatPointerDown={(key, e) => {
                const occ = occupants.get(key);
                if (occ && !picked) startParticipantDrag(e, occ.participant.id);
              }}
              onSeatClick={(key) => handleSeatClick(key)}
              onTablePointerDown={mode === "layout" ? onTablePointerDown : undefined}
              onBackgroundPointerDown={() => {
                if (mode !== "layout") return;
                blurActiveField();
                setSelectedTableId(null);
              }}
              className="block select-none mx-auto"
              style={{ width: svgWidth, height: "auto", ["--rp-font" as string]: "var(--font-inter)" } as React.CSSProperties}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-t border-border-subtle text-body-sm text-on-surface-variant">
            {mode === "assign" ? (
              <>
                <span>Seret wajah untuk memindah/menukar kursi · klik kursi untuk detail</span>
                <span className="ml-auto">Kursi kosong bergaris putus-putus</span>
              </>
            ) : (
              <>
                <span>Seret meja untuk memindah · klik meja untuk mengatur kursi, bentuk & rotasi</span>
                <span className="ml-auto">
                  Ruangan {(roomWidth / 100).toLocaleString("id-ID")} × {(roomDepth / 100).toLocaleString("id-ID")} m
                </span>
              </>
            )}
          </div>
        </section>

        {/* ------------------------------------------------ side panel */}
        <aside className="min-w-0 lg:col-span-4 xl:col-span-3 lg:sticky lg:top-20">
          {mode === "assign" ? (
            <PeoplePanel
              participants={participants}
              faceIndex={faceIndex}
              seatOf={seatOfParticipant}
              capacity={capacity}
              locked={locked}
              pickedId={picked}
              dragActive={!!drag}
              dropOverUnseat={!!drag?.overUnseat}
              onPick={(id) => {
                setPicked(id);
                setPopover(null);
              }}
              onDragStart={startParticipantDrag}
              onLocate={locate}
              onAutoAssign={autoAssign}
              onShuffle={shuffle}
              onClear={clearAll}
            />
          ) : (
            <LayoutPanel
              template={activeDay.layoutTemplate}
              participantCount={Math.max(participants.length, classGroup?.estimatedParticipants ?? 0)}
              roomWidth={roomWidth}
              roomDepth={roomDepth}
              minRoom={{ width: bounds ? bounds.maxX + EDGE : 500, depth: bounds ? bounds.maxY + EDGE : 400 }}
              selectedTable={selectedTable}
              occupiedInSelected={selectedTable ? assignments.filter((a) => a.seatingTableId === selectedTable.id).length : 0}
              locked={locked}
              onApplyTemplate={applyTemplate}
              onRoomSize={setRoomSize}
              onAddTable={addTable}
              onUpdateTable={(patch) => selectedTable && updateTable(selectedTable.id, patch)}
              onRenameTable={(id, name) => updateTable(id, { name })}
              onDuplicateTable={duplicateSelected}
              onDeleteTable={deleteSelected}
            />
          )}
        </aside>
      </div>

      {/* ------------------------------------------------ print / export version */}
      <style>{`@media print { @page { size: A4 ${printLandscape ? "landscape" : "portrait"}; margin: 10mm; } .print-sheet svg { max-height: ${printLandscape ? 188 : 275}mm; } }`}</style>
      <div className="print-only print-sheet" aria-hidden>
        <RoomPlan
          svgRef={printSvgRef}
          roomWidth={roomWidth}
          roomDepth={roomDepth}
          tables={displayTables}
          occupants={occupants}
          mode="export"
          labelMode={labelMode === "hidden" ? "name" : labelMode}
          header={{
            title: exportTitle,
            subtitle: exportSubtitle,
            meta: `Dicetak ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`,
          }}
          style={{ ["--rp-font" as string]: "var(--font-inter)" } as React.CSSProperties}
        />
      </div>

      <div className="no-print">
        <StepFooterNav
          backHref={`/classes/${classGroupId}/labeling`}
          backLabel="Labeling Wajah"
          nextHref={`/classes/${classGroupId}/report`}
          nextLabel="Laporan Instruktur"
          hint={
            participants.length - seatedCount > 0
              ? `${participants.length - seatedCount} peserta belum duduk di ${activeDay.label}`
              : participants.length
                ? `Semua peserta sudah duduk di ${activeDay.label}`
                : undefined
          }
        />
      </div>

      {/* drag ghost */}
      {drag && dragParticipant && (
        <div className="fixed z-[70] pointer-events-none -translate-x-1/2 -translate-y-1/2 no-print" style={{ left: drag.x, top: drag.y }}>
          <div className="flex flex-col items-center gap-1">
            <Avatar src={faceIndex.get(dragParticipant.id)?.faceUrl} name={dragParticipant.displayName} size={52} ring="ring-primary-container" className="shadow-2xl" />
            <span className="rounded-md bg-inverse-surface px-2 py-0.5 text-label-sm font-label-sm text-inverse-on-surface shadow">
              {drag.overSeat && drag.overSeat !== drag.from
                ? occupants.get(drag.overSeat)
                  ? drag.from
                    ? "Tukar tempat"
                    : "Gantikan"
                  : "Duduk di sini"
                : drag.overUnseat
                  ? "Kosongkan kursi"
                  : dragParticipant.displayName}
            </span>
          </div>
        </div>
      )}

      {popover && popoverSeat && popoverTable && (
        <SeatPopover
          anchor={popover.rect}
          seat={{ key: popover.key, tableName: popoverTable.name, seatNumber: popoverSeat.seatIndex + 1 }}
          occupant={popoverOccupant}
          faceIndex={faceIndex}
          participants={participants}
          seatOf={seatOfParticipant}
          locked={locked}
          nameHidden={labelMode === "hidden" && revealedSeat !== popover.key}
          onClose={() => setPopover(null)}
          onPlace={(pid) => {
            const key = popover.key;
            setPopover(null);
            place(pid, key);
          }}
          onUnseat={(pid) => {
            setPopover(null);
            unseat(pid);
          }}
          onMove={(pid) => {
            setPopover(null);
            setPicked(pid);
          }}
          onEdit={(p) => {
            setPopover(null);
            setEditing(p);
          }}
          onReveal={() => setRevealedSeat(popover.key)}
        />
      )}

      <NewDayDialog
        open={newDayOpen}
        days={days}
        activeDayId={activeDayId}
        defaultTemplate={activeDay.layoutTemplate}
        onSubmit={createDay}
        onClose={() => setNewDayOpen(false)}
      />
      <RenameDayDialog day={renameDay} onSubmit={doRename} onClose={() => setRenameDay(null)} />
      <ParticipantEditor
        open={!!editing}
        onClose={() => setEditing(null)}
        participant={editing}
        classGroupId={classGroupId}
        faceUrl={editing ? faceIndex.get(editing.id)?.faceUrl : null}
        onSaved={() => reloadClass()}
      />
    </div>
  );
}
