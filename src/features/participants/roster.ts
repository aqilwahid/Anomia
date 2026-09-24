import type { RosterRow } from "@/store/store";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s().-]{8,}$/;
const HEADER = /^(no\.?|nomor|nama|name|peserta)\b/i;

function fold(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Parse a pasted roster. One participant per line. Columns may be separated
 * by TAB (copied from Excel / Google Sheets), ";" or "|":
 *   Nama | Instansi | Jabatan | Email | No. HP
 * Commas are NOT separators — Indonesian names often carry degrees
 * ("Budi Santoso, S.T., M.T."). Email/phone columns are recognised wherever
 * they appear. A leading row number ("1." / "1)") and a header row are skipped.
 */
export function parseRoster(text: string): RosterRow[] {
  const rows: RosterRow[] = [];
  const lines = text.split(/\r?\n/);
  let firstContentLine = true;
  lines.forEach((line) => {
    if (!line.trim()) return;
    const isFirst = firstContentLine;
    firstContentLine = false;
    let cells = line.split(/\t|;|\|/).map((c) => c.trim());
    // drop a pure row-number column ("1", "01", "1.")
    if (cells.length > 1 && /^\d{1,4}[.)]?$/.test(cells[0])) cells = cells.slice(1);
    // "1. Budi Santoso" / "1) Budi"
    cells[0] = cells[0].replace(/^\d{1,4}[.)]\s+/, "");
    if (isFirst && HEADER.test(cells[0]) && (cells.length > 1 || /^nama( peserta)?$/i.test(cells[0]))) return;

    const row: RosterRow = { displayName: "" };
    const rest: string[] = [];
    for (const cell of cells) {
      if (!cell) continue;
      if (!row.email && EMAIL.test(cell)) row.email = cell;
      else if (!row.phone && PHONE.test(cell) && /\d{6,}/.test(cell.replace(/\D/g, ""))) row.phone = cell;
      else rest.push(cell);
    }
    if (rest.length === 0) return;
    row.displayName = rest[0].replace(/\s+/g, " ");
    if (rest[1]) row.organization = rest[1];
    if (rest[2]) row.jobTitle = rest[2];
    if (rest.length > 3) row.notes = rest.slice(3).join(" · ");
    rows.push(row);
  });
  return rows;
}

/** Split parsed rows into new ones and ones whose name already exists (or repeats in the paste). */
export function dedupeRoster(rows: RosterRow[], existingNames: string[]) {
  const seen = new Set(existingNames.map(fold));
  const fresh: RosterRow[] = [];
  const duplicates: RosterRow[] = [];
  for (const row of rows) {
    const key = fold(row.displayName);
    if (!key) continue;
    if (seen.has(key)) duplicates.push(row);
    else {
      seen.add(key);
      fresh.push(row);
    }
  }
  return { fresh, duplicates };
}
