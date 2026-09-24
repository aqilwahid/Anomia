import type { SeatingTable, TableLayoutTemplate } from "@/domain/layout";
import type { TableDraft } from "@/store/store";
import {
  FRONT_ZONE,
  LABEL_SPACE,
  ROW_DEPTH,
  SEAT_GAP,
  SEAT_PITCH,
  SEAT_R,
  SIDE_LABEL,
  WALL_MARGIN,
  roundRingRadius,
  tableBounds,
} from "./geometry";

export interface GeneratedLayout {
  tables: TableDraft[];
  roomWidth: number;
  roomDepth: number;
}

const ROW_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function roundUp(value: number, step = 50) {
  return Math.ceil(value / step) * step;
}

function balanced(total: number, groups: number): number[] {
  const base = Math.floor(total / groups);
  const extra = total % groups;
  return Array.from({ length: groups }, (_, i) => base + (i < extra ? 1 : 0));
}

function roundTables(n: number, perTable: number): GeneratedLayout {
  const count = Math.max(1, Math.ceil(n / perTable));
  const seats = Math.max(perTable, Math.ceil(n / count));
  const ring = roundRingRadius(seats);
  const cell = 2 * (ring + SEAT_R) + 64;
  const cols = count <= 3 ? count : Math.min(5, Math.ceil(Math.sqrt(count * 1.6)));
  const rows = Math.ceil(count / cols);
  const roomWidth = roundUp(Math.max(700, cols * cell + WALL_MARGIN * 2));
  const top = FRONT_ZONE + 30;
  const roomDepth = roundUp(top + rows * cell + WALL_MARGIN);
  const tables: TableDraft[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const inRow = r === rows - 1 ? count - r * cols : cols;
    const c = i - r * cols;
    const rowWidth = inRow * cell;
    tables.push({
      name: `Meja ${i + 1}`,
      shape: "round",
      seatCount: seats,
      x: (roomWidth - rowWidth) / 2 + cell / 2 + c * cell,
      y: top + cell / 2 + r * cell,
      rotation: 0,
    });
  }
  return { tables, roomWidth, roomDepth };
}

function classroom(n: number): GeneratedLayout {
  const perTable = n > 40 ? 3 : 2;
  const tableCount = Math.max(1, Math.ceil(n / perTable));
  const cols = Math.min(4, Math.max(2, Math.round(Math.sqrt(tableCount * 0.9))));
  const rows = Math.ceil(tableCount / cols);
  const tableLen = perTable * SEAT_PITCH + 16;
  const aisle = 90;
  const rowPitch = ROW_DEPTH + SEAT_GAP + SEAT_R + LABEL_SPACE + 50;
  const blockWidth = cols * tableLen + (cols - 1) * aisle;
  const roomWidth = roundUp(Math.max(700, blockWidth + WALL_MARGIN * 2 + 40));
  const left = (roomWidth - blockWidth) / 2;
  const top = FRONT_ZONE + 50;
  const tables: TableDraft[] = [];
  for (let i = 0; i < tableCount; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    tables.push({
      name: `Meja ${ROW_LETTERS[r % 26]}${c + 1}`,
      shape: "row",
      seatCount: perTable,
      x: left + tableLen / 2 + c * (tableLen + aisle),
      y: top + ROW_DEPTH / 2 + r * rowPitch,
      rotation: 0,
    });
  }
  const roomDepth = roundUp(top + (rows - 1) * rowPitch + ROW_DEPTH + SEAT_GAP + SEAT_R + LABEL_SPACE + WALL_MARGIN);
  return { tables, roomWidth, roomDepth };
}

function conference(n: number): GeneratedLayout {
  const count = Math.max(1, Math.ceil(n / 22));
  const seatsEach = balanced(Math.max(n, 6 * count), count);
  const tables: TableDraft[] = [];
  let y = FRONT_ZONE + 60;
  let maxWidth = 0;
  seatsEach.forEach((seats, i) => {
    const draft: TableDraft = { name: count === 1 ? "Meja Rapat" : `Meja Rapat ${i + 1}`, shape: "rect", seatCount: seats, x: 0, y: 0, rotation: 0 };
    const b = tableBounds({ ...(draft as SeatingTable), id: "", seatingDayId: "", order: 0 });
    const height = b.maxY - b.minY;
    draft.y = y - b.minY;
    y += height + 70;
    maxWidth = Math.max(maxWidth, b.maxX - b.minX);
    tables.push(draft);
  });
  const roomWidth = roundUp(Math.max(700, maxWidth + WALL_MARGIN * 2 + 80));
  tables.forEach((t) => (t.x = roomWidth / 2));
  return { tables, roomWidth, roomDepth: roundUp(y - 70 + WALL_MARGIN) };
}

function hollowSquare(n: number): GeneratedLayout {
  const total = Math.max(n, 8);
  const horizontal = Math.max(2, Math.ceil(total * 0.3));
  const vertical = Math.max(1, Math.ceil((total - horizontal * 2) / 2));
  const hLen = horizontal * SEAT_PITCH + 20;
  const vLen = vertical * SEAT_PITCH + 20;
  const outer = SEAT_GAP + SEAT_R + LABEL_SPACE;
  const width = hLen + 2 * ROW_DEPTH + 2 * (SEAT_GAP + SEAT_R + SIDE_LABEL + 16);
  const roomWidth = roundUp(Math.max(700, width + WALL_MARGIN * 2));
  const cx = roomWidth / 2;
  const topY = FRONT_ZONE + 40 + outer + ROW_DEPTH / 2;
  const cy = topY + ROW_DEPTH / 2 + vLen / 2;
  const bottomY = cy + vLen / 2 + ROW_DEPTH / 2;
  const tables: TableDraft[] = [
    { name: "Sisi Depan", shape: "row", seatCount: horizontal, x: cx, y: topY, rotation: 180 },
    { name: "Sisi Kanan", shape: "row", seatCount: vertical, x: cx + hLen / 2 + ROW_DEPTH / 2, y: cy, rotation: -90 },
    { name: "Sisi Belakang", shape: "row", seatCount: horizontal, x: cx, y: bottomY, rotation: 0 },
    { name: "Sisi Kiri", shape: "row", seatCount: vertical, x: cx - hLen / 2 - ROW_DEPTH / 2, y: cy, rotation: 90 },
  ];
  return { tables, roomWidth, roomDepth: roundUp(bottomY + ROW_DEPTH / 2 + outer + WALL_MARGIN) };
}

function uShape(n: number): GeneratedLayout {
  const total = Math.max(n, 6);
  const base = Math.max(2, Math.ceil(total * 0.34));
  const arm = Math.max(1, Math.ceil((total - base) / 2));
  const hLen = base * SEAT_PITCH + 20;
  const vLen = arm * SEAT_PITCH + 20;
  const outer = SEAT_GAP + SEAT_R + LABEL_SPACE;
  const width = hLen + 2 * ROW_DEPTH + 2 * (SEAT_GAP + SEAT_R + SIDE_LABEL + 16);
  const roomWidth = roundUp(Math.max(700, width + WALL_MARGIN * 2));
  const cx = roomWidth / 2;
  const armTop = FRONT_ZONE + 70;
  const armY = armTop + vLen / 2;
  const baseY = armTop + vLen + ROW_DEPTH / 2;
  const tables: TableDraft[] = [
    { name: "Sayap Kiri", shape: "row", seatCount: arm, x: cx - hLen / 2 - ROW_DEPTH / 2, y: armY, rotation: 90 },
    { name: "Sisi Belakang", shape: "row", seatCount: base, x: cx, y: baseY, rotation: 0 },
    { name: "Sayap Kanan", shape: "row", seatCount: arm, x: cx + hLen / 2 + ROW_DEPTH / 2, y: armY, rotation: -90 },
  ];
  return { tables, roomWidth, roomDepth: roundUp(baseY + ROW_DEPTH / 2 + outer + WALL_MARGIN) };
}

function theater(n: number): GeneratedLayout {
  const perRow = Math.min(14, Math.max(4, Math.ceil(Math.sqrt(n * 1.6))));
  const rows = Math.max(1, Math.ceil(n / perRow));
  const split = perRow > 7;
  const blocks = split ? [Math.ceil(perRow / 2), Math.floor(perRow / 2)] : [perRow];
  const aisle = 100;
  const rowPitch = SEAT_R * 2 + LABEL_SPACE + 44;
  const blockWidths = blocks.map((b) => b * SEAT_PITCH);
  const totalWidth = blockWidths.reduce((a, b) => a + b, 0) + (blocks.length - 1) * aisle;
  const roomWidth = roundUp(Math.max(700, totalWidth + WALL_MARGIN * 2 + 60));
  const left = (roomWidth - totalWidth) / 2;
  const top = FRONT_ZONE + 60;
  const tables: TableDraft[] = [];
  for (let r = 0; r < rows; r++) {
    let x = left;
    blocks.forEach((count, b) => {
      tables.push({
        name: blocks.length > 1 ? `Baris ${ROW_LETTERS[r % 26]}${b === 0 ? " kiri" : " kanan"}` : `Baris ${ROW_LETTERS[r % 26]}`,
        shape: "chairs",
        seatCount: count,
        x: x + blockWidths[b] / 2,
        y: top + SEAT_R + r * rowPitch,
        rotation: 0,
      });
      x += blockWidths[b] + aisle;
    });
  }
  return { tables, roomWidth, roomDepth: roundUp(top + rows * rowPitch + WALL_MARGIN) };
}

/**
 * Generate a sensible starting floor plan for a template and head count.
 * Everything stays editable afterwards (drag, rotate, seat count).
 */
export function generateLayout(template: TableLayoutTemplate, participantCount: number): GeneratedLayout {
  const n = Math.max(4, Math.round(participantCount) || 0);
  switch (template) {
    case "banquet":
      return roundTables(n, n <= 12 ? 6 : 8);
    case "classroom":
      return classroom(n);
    case "conference":
      return conference(n);
    case "hollow-square":
      return hollowSquare(n);
    case "ushape":
      return uShape(n);
    case "theater":
      return theater(n);
    case "custom":
    default:
      return roundTables(n, 4);
  }
}

export function capacityOf(tables: Array<Pick<SeatingTable, "seatCount">>) {
  return tables.reduce((sum, t) => sum + t.seatCount, 0);
}
