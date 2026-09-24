import { useMemo } from "react";
import type { SeatingTable, TableLayoutTemplate } from "@/domain/layout";
import { FRONT_ZONE, SEAT_R, seatPositions, tableGeometry } from "./geometry";
import { generateLayout } from "./templates";

/** Miniature floor plan of a template — used in template pickers and class cards. */
export function TemplatePreview({
  template,
  participants = 24,
  className = "",
  active = false,
}: {
  template: TableLayoutTemplate;
  participants?: number;
  className?: string;
  active?: boolean;
}) {
  const layout = useMemo(() => generateLayout(template, participants), [template, participants]);
  const tables = layout.tables.map(
    (t, i) => ({ ...t, id: `p${i}`, seatingDayId: "", order: i }) as SeatingTable
  );
  const stroke = active ? "#2563eb" : "#94a3b8";
  const fill = active ? "#dbe1ff" : "#e2e8f0";
  return (
    <svg
      viewBox={`0 0 ${layout.roomWidth} ${layout.roomDepth}`}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <rect x={4} y={4} width={layout.roomWidth - 8} height={layout.roomDepth - 8} rx={30} fill="#fff" stroke="#e2e8f0" strokeWidth={8} />
      <rect x={layout.roomWidth * 0.3} y={34} width={layout.roomWidth * 0.4} height={FRONT_ZONE * 0.18} rx={10} fill={stroke} opacity={0.7} />
      {tables.map((t) => {
        const geo = tableGeometry(t);
        const seats = seatPositions(t);
        return (
          <g key={t.id}>
            {geo.shape === "round" ? (
              <circle cx={t.x} cy={t.y} r={geo.width / 2} fill={fill} stroke={stroke} strokeWidth={8} />
            ) : geo.shape !== "chairs" ? (
              <rect
                x={(t.x ?? 0) - geo.width / 2}
                y={(t.y ?? 0) - geo.height / 2}
                width={geo.width}
                height={geo.height}
                rx={10}
                fill={fill}
                stroke={stroke}
                strokeWidth={8}
                transform={`rotate(${t.rotation ?? 0} ${t.x} ${t.y})`}
              />
            ) : null}
            {seats.map((s) => (
              <circle key={s.index} cx={s.x} cy={s.y} r={SEAT_R * 0.9} fill={stroke} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
