import type { SeatingTable, TableLayoutTemplate, TableShape } from "@/domain/layout";

/**
 * Room geometry, all in centimetres. The room's front wall (screen /
 * facilitator) is y = 0; x runs left → right as seen from the back of the
 * room, like a printed floor plan.
 */
export const SEAT_PITCH = 64; // centre-to-centre distance of chairs along a table edge
export const SEAT_R = 21; // drawn radius of a chair / face avatar
export const SEAT_GAP = 30; // table edge → chair centre
export const ROW_DEPTH = 50; // one-sided (classroom / U / hollow square) table depth
export const RECT_DEPTH = 100; // two-sided conference table depth
export const LABEL_SPACE = 22; // room under a chair for the name label
export const SIDE_LABEL = 84; // room beside a chair on the left/right side of a table
export const FRONT_ZONE = 150; // reserved strip at the front for screen + facilitator desk
export const WALL_MARGIN = 60;
export const GRID = 10; // snap step while dragging
export const EDGE = 10; // tables (incl. chairs & labels) keep this distance from the walls

export interface Point {
  x: number;
  y: number;
}

export interface SeatPoint extends Point {
  index: number;
  /** unit vector pointing away from the table (where the person's back is) */
  nx: number;
  ny: number;
}

export interface TableGeometry {
  shape: TableShape;
  /** unrotated surface size (for round: diameter) */
  width: number;
  height: number;
  /** chair centres in local (unrotated, table-centred) coordinates */
  seats: SeatPoint[];
}

export function defaultShapeFor(template: TableLayoutTemplate): TableShape {
  switch (template) {
    case "classroom":
    case "ushape":
    case "hollow-square":
      return "row";
    case "conference":
      return "rect";
    case "theater":
      return "chairs";
    default:
      return "round";
  }
}

export function roundRingRadius(seatCount: number) {
  return Math.max(84, (Math.max(seatCount, 1) * SEAT_PITCH) / (2 * Math.PI));
}

function spread(count: number, length: number, y: number, startIndex: number, reverse = false, ny = 1): SeatPoint[] {
  const out: SeatPoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const x = -length / 2 + (reverse ? 1 - t : t) * length;
    out.push({ index: startIndex + i, x, y, nx: 0, ny });
  }
  return out;
}

export function rectSides(seatCount: number) {
  const ends = seatCount >= 6 ? 2 : 0;
  const sides = Math.max(0, seatCount - ends);
  const top = Math.ceil(sides / 2);
  const bottom = sides - top;
  return { ends, top, bottom };
}

export function tableGeometry(table: Pick<SeatingTable, "seatCount"> & { shape?: TableShape }): TableGeometry {
  const shape = table.shape ?? "round";
  const n = Math.max(0, table.seatCount);

  if (shape === "round") {
    const ring = roundRingRadius(n);
    const radius = ring - SEAT_R - 8;
    const seats: SeatPoint[] = [];
    for (let i = 0; i < n; i++) {
      const angle = -Math.PI / 2 + (i / Math.max(n, 1)) * 2 * Math.PI;
      seats.push({ index: i, x: ring * Math.cos(angle), y: ring * Math.sin(angle), nx: Math.cos(angle), ny: Math.sin(angle) });
    }
    return { shape, width: radius * 2, height: radius * 2, seats };
  }

  if (shape === "rect") {
    const { ends, top, bottom } = rectSides(n);
    const length = Math.max(120, Math.max(top, bottom, 1) * SEAT_PITCH);
    const depth = RECT_DEPTH;
    const seats: SeatPoint[] = [];
    // clockwise around the table: top L→R, right end, bottom R→L, left end
    seats.push(...spread(top, length, -(depth / 2 + SEAT_GAP), 0, false, -1));
    if (ends) seats.push({ index: seats.length, x: length / 2 + SEAT_GAP, y: 0, nx: 1, ny: 0 });
    seats.push(...spread(bottom, length, depth / 2 + SEAT_GAP, seats.length, true, 1));
    if (ends) seats.push({ index: seats.length, x: -(length / 2 + SEAT_GAP), y: 0, nx: -1, ny: 0 });
    return { shape, width: length, height: depth, seats };
  }

  if (shape === "row") {
    const length = Math.max(100, n * SEAT_PITCH);
    return { shape, width: length, height: ROW_DEPTH, seats: spread(n, length, ROW_DEPTH / 2 + SEAT_GAP, 0) };
  }

  // chairs only
  const length = Math.max(SEAT_PITCH, n * SEAT_PITCH);
  return { shape, width: length, height: SEAT_R * 2 + 12, seats: spread(n, length, 0, 0) };
}

export function rotatePoint(p: Point, degrees: number): Point {
  if (!degrees) return { x: p.x, y: p.y };
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

export function tableCenter(table: Pick<SeatingTable, "x" | "y">): Point {
  return { x: table.x ?? 0, y: table.y ?? 0 };
}

/** Chair centres in room coordinates. */
export function seatPositions(table: SeatingTable): SeatPoint[] {
  const geo = tableGeometry(table);
  const c = tableCenter(table);
  return geo.seats.map((s) => {
    const p = rotatePoint(s, table.rotation ?? 0);
    const n = rotatePoint({ x: s.nx, y: s.ny }, table.rotation ?? 0);
    return { index: s.index, x: c.x + p.x, y: c.y + p.y, nx: n.x, ny: n.y };
  });
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Room-space bounding box of a table including its chairs and name labels. */
export function tableBounds(table: SeatingTable): Bounds {
  const geo = tableGeometry(table);
  const c = tableCenter(table);
  const rot = table.rotation ?? 0;
  const corners =
    geo.shape === "round"
      ? [
          { x: -geo.width / 2, y: -geo.height / 2 },
          { x: geo.width / 2, y: geo.height / 2 },
        ]
      : [
          { x: -geo.width / 2, y: -geo.height / 2 },
          { x: geo.width / 2, y: -geo.height / 2 },
          { x: geo.width / 2, y: geo.height / 2 },
          { x: -geo.width / 2, y: geo.height / 2 },
        ].map((p) => rotatePoint(p, rot));
  const points = [...corners.map((p) => ({ x: c.x + p.x, y: c.y + p.y }))];
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of points) {
    b.minX = Math.min(b.minX, p.x);
    b.maxX = Math.max(b.maxX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxY = Math.max(b.maxY, p.y);
  }
  for (const s of seatPositions(table)) {
    const sideLabel = geo.shape !== "round" && Math.abs(s.nx) > 0.75;
    b.minX = Math.min(b.minX, s.x - SEAT_R - (sideLabel && s.nx < 0 ? SIDE_LABEL : 18));
    b.maxX = Math.max(b.maxX, s.x + SEAT_R + (sideLabel && s.nx > 0 ? SIDE_LABEL : 18));
    b.minY = Math.min(b.minY, s.y - SEAT_R);
    b.maxY = Math.max(b.maxY, s.y + SEAT_R + (sideLabel ? 0 : LABEL_SPACE));
  }
  if (!Number.isFinite(b.minX)) return { minX: c.x, minY: c.y, maxX: c.x, maxY: c.y };
  return b;
}

export function snap(value: number, step = GRID) {
  return Math.round(value / step) * step;
}

/** Keep a table (with its chairs) inside the room, below the front zone. */
export function clampTableCenter(table: SeatingTable, x: number, y: number, roomWidth: number, roomDepth: number): Point {
  const probe = tableBounds({ ...table, x, y });
  let dx = 0;
  let dy = 0;
  if (probe.minX < EDGE) dx = EDGE - probe.minX;
  if (probe.maxX > roomWidth - EDGE) dx = roomWidth - EDGE - probe.maxX;
  if (probe.minY < FRONT_ZONE * 0.55) dy = FRONT_ZONE * 0.55 - probe.minY;
  if (probe.maxY > roomDepth - EDGE) dy = roomDepth - EDGE - probe.maxY;
  return { x: x + dx, y: y + dy };
}

export function seatKey(tableId: string, seatIndex: number) {
  return `${tableId}:${seatIndex}`;
}

export function parseSeatKey(key: string): { tableId: string; seatIndex: number } | null {
  const i = key.lastIndexOf(":");
  if (i <= 0) return null;
  const seatIndex = Number(key.slice(i + 1));
  if (!Number.isInteger(seatIndex)) return null;
  return { tableId: key.slice(0, i), seatIndex };
}

/** Name shown on the plan under a chair: first name, or first two words when the first is very short. */
export function shortName(name: string, max = 13): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  let label = words[0];
  if ((label.length <= 3 || /\.$/.test(label)) && words[1]) label = `${label} ${words[1]}`;
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}
