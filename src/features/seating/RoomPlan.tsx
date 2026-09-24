"use client";

import { memo, useId } from "react";
import type { SeatingTable } from "@/domain/layout";
import type { Participant } from "@/domain/participant";
import { colorFor, initialsOf } from "@/ui/Avatar";
import {
  FRONT_ZONE,
  SEAT_R,
  seatKey,
  seatPositions,
  shortName,
  tableBounds,
  tableGeometry,
} from "./geometry";

export interface SeatOccupant {
  participant: Participant;
  faceUrl: string | null;
}

export type LabelMode = "name" | "name-org" | "hidden";

export interface ExportHeader {
  title: string;
  subtitle?: string;
  meta?: string;
}

const HEADER_H = 150;
const FOOTER_H = 56;

const INK = "#1e293b";
const MUTED = "#64748b";
const LINE = "#cbd5e1";
const BLUE = "#2563eb";

function labelWidth(text: string, fontSize: number) {
  return text.length * fontSize * 0.58 + 10;
}

/** Names go beside chairs on the left/right of long tables (they'd collide stacked vertically), else below. */
function labelSide(table: SeatingTable, seat: { nx: number }): "below" | "left" | "right" {
  if ((table.shape ?? "round") === "round" || Math.abs(seat.nx) <= 0.75) return "below";
  return seat.nx > 0 ? "right" : "left";
}

/**
 * Rotation for text drawn on a table: follows the table so long names fit,
 * but never upside down — vertical tables always read bottom-to-top.
 */
function textRotation(rotation: number) {
  const r = ((rotation % 360) + 360) % 360;
  if (r === 90 || r === 270) return -90;
  return r > 90 && r < 270 ? r - 180 : r;
}

export interface RoomPlanProps {
  roomWidth: number;
  roomDepth: number;
  tables: SeatingTable[];
  occupants: Map<string, SeatOccupant>;
  /** "export" renders a clean, self-contained drawing for print / PNG */
  mode: "assign" | "layout" | "export";
  labelMode: LabelMode;
  selectedTableId?: string | null;
  selectedSeatKey?: string | null;
  dropTargetKey?: string | null;
  draggingParticipantId?: string | null;
  highlightParticipantId?: string | null;
  revealedSeatKey?: string | null;
  pickedParticipantId?: string | null;
  instructorPosition?: "top" | "bottom" | "custom";
  instructorX?: number;
  instructorY?: number;
  instructorLabel?: string;
  selectedInstructor?: boolean;
  header?: ExportHeader;
  svgRef?: React.Ref<SVGSVGElement>;
  onSeatPointerDown?: (key: string, e: React.PointerEvent<SVGGElement>) => void;
  onSeatClick?: (key: string, e: React.MouseEvent<SVGGElement>) => void;
  onTablePointerDown?: (tableId: string, e: React.PointerEvent<SVGGElement>) => void;
  onInstructorPointerDown?: (e: React.PointerEvent<SVGGElement>) => void;
  onInstructorClick?: (e: React.MouseEvent<SVGGElement>) => void;
  onBackgroundPointerDown?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The whole training room as one SVG drawing: front wall with screen and
 * instructor desk, every table in its real position/rotation, and every
 * chair with the participant's face and name. The same component renders
 * the interactive editor and the print / PNG version, so what you share is
 * exactly the room you arranged.
 */
export const RoomPlan = memo(function RoomPlan({
  roomWidth,
  roomDepth,
  tables,
  occupants,
  mode,
  labelMode,
  selectedTableId,
  selectedSeatKey,
  dropTargetKey,
  draggingParticipantId,
  highlightParticipantId,
  revealedSeatKey,
  pickedParticipantId,
  instructorPosition = "top",
  instructorX,
  instructorY,
  instructorLabel,
  selectedInstructor,
  header,
  svgRef,
  onSeatPointerDown,
  onSeatClick,
  onTablePointerDown,
  onInstructorPointerDown,
  onInstructorClick,
  onBackgroundPointerDown,
  className,
  style,
}: RoomPlanProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const faceClip = `rp-face-${uid}`;
  const gridId = `rp-grid-${uid}`;
  const interactive = mode !== "export";
  const top = header ? HEADER_H : 0;
  const bottom = header ? FOOTER_H : 0;
  const totalHeight = top + roomDepth + bottom;
  const screenW = Math.min(roomWidth * 0.46, 460);
  const occupied = tables.reduce(
    (sum, t) => sum + Array.from({ length: t.seatCount }).filter((_, i) => occupants.has(seatKey(t.id, i))).length,
    0
  );
  const capacity = tables.reduce((sum, t) => sum + t.seatCount, 0);

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      viewBox={`0 0 ${roomWidth} ${totalHeight}`}
      width={mode === "export" ? roomWidth : undefined}
      height={mode === "export" ? totalHeight : undefined}
      className={className}
      style={style}
      role="img"
      aria-label={`Denah ruangan: ${tables.length} meja, ${occupied} dari ${capacity} kursi terisi`}
    >
      <defs>
        <style>{`.rp-t{font-family:var(--rp-font,'Helvetica Neue',Arial,sans-serif)}`}</style>
        <clipPath id={faceClip} clipPathUnits="objectBoundingBox">
          <circle cx="0.5" cy="0.5" r="0.5" />
        </clipPath>
        {interactive && (
          <pattern id={gridId} width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M50 0H0V50" fill="none" stroke="#eef2f7" strokeWidth="2" />
          </pattern>
        )}
      </defs>

      <rect x={0} y={0} width={roomWidth} height={totalHeight} fill="#ffffff" />

      {header && (
        <g className="rp-t">
          {(() => {
            const counts = `${occupied}/${capacity} kursi terisi`;
            const countsW = labelWidth(counts, 18);
            // shrink long titles so they never run into the counter on narrow rooms
            const titleSize = Math.max(20, Math.min(34, (roomWidth - 72 - countsW) / Math.max(1, header.title.length * 0.58)));
            const subSize = Math.max(13, Math.min(20, (roomWidth - 48) / Math.max(1, (header.subtitle ?? "").length * 0.56)));
            return (
              <>
                <text x={24} y={50} fontSize={titleSize} fontWeight={700} fill={INK}>
                  {header.title}
                </text>
                <text x={roomWidth - 24} y={50} fontSize={18} fontWeight={600} fill={MUTED} textAnchor="end">
                  {counts}
                </text>
                {header.subtitle && (
                  <text x={24} y={88} fontSize={subSize} fontWeight={500} fill={MUTED}>
                    {header.subtitle}
                  </text>
                )}
                {header.meta && (
                  <text x={24} y={118} fontSize={14} fill="#94a3b8">
                    {header.meta}
                  </text>
                )}
              </>
            );
          })()}
        </g>
      )}

      <g transform={`translate(0 ${top})`}>
        {/* floor + walls */}
        <rect
          x={4}
          y={4}
          width={roomWidth - 8}
          height={roomDepth - 8}
          rx={18}
          fill={interactive ? `url(#${gridId})` : "#fcfdff"}
          stroke="#94a3b8"
          strokeWidth={6}
          onPointerDown={onBackgroundPointerDown}
        />

        {/* instructor & screen zone */}
        {(() => {
          const isBottom = instructorPosition === "bottom";
          const isCustom = instructorPosition === "custom";

          const instCenterX = instructorX ?? roomWidth / 2;
          let screenY: number;
          let screenLabelY: number;
          let screenLabelText = "LAYAR · DEPAN KELAS";
          const deskX = instCenterX - 70;
          let deskY: number;

          if (isBottom) {
            screenY = roomDepth - 28;
            screenLabelY = roomDepth - 34;
            screenLabelText = "LAYAR · BELAKANG KELAS";
            deskY = roomDepth - 94;
          } else if (isCustom) {
            const instCenterY = instructorY ?? 64;
            deskY = instCenterY - 23;
            if (instCenterY >= roomDepth / 2) {
              screenY = Math.min(roomDepth - 28, instCenterY + 32);
              screenLabelY = screenY - 6;
              screenLabelText = "LAYAR";
            } else {
              screenY = Math.max(16, instCenterY - 44);
              screenLabelY = screenY + 22;
              screenLabelText = "LAYAR";
            }
          } else {
            // top
            screenY = 16;
            screenLabelY = 50;
            screenLabelText = "LAYAR · DEPAN KELAS";
            deskY = 64;
          }

          const instLabel = instructorLabel || "Instruktur";
          const minY = Math.min(deskY, screenY);
          const maxY = Math.max(deskY + 46, screenY + 12);
          const minX = Math.min(deskX, (roomWidth - screenW) / 2);
          const maxX = Math.max(deskX + 140, (roomWidth + screenW) / 2);

          return (
            <g
              className="rp-t"
              pointerEvents={mode === "layout" ? "all" : "none"}
              style={mode === "layout" ? { cursor: "move", touchAction: "none" } : undefined}
              onPointerDown={mode === "layout" ? onInstructorPointerDown : undefined}
              onClick={mode === "layout" ? onInstructorClick : undefined}
            >
              {/* Highlight bounding box when selected in layout mode */}
              {selectedInstructor && mode === "layout" && (
                <g pointerEvents="none">
                  <rect
                    x={minX - 10}
                    y={minY - 10}
                    width={maxX - minX + 20}
                    height={maxY - minY + 20}
                    rx={14}
                    fill="rgba(37,99,235,0.06)"
                    stroke={BLUE}
                    strokeWidth={2}
                    strokeDasharray="8 6"
                  />
                  <rect
                    x={instCenterX - 65}
                    y={minY - 14}
                    width={130}
                    height={18}
                    rx={5}
                    fill={BLUE}
                  />
                  <text
                    x={instCenterX}
                    y={minY - 1}
                    fontSize={10}
                    fontWeight={700}
                    fill="#ffffff"
                    textAnchor="middle"
                  >
                    Instruktur & Layar
                  </text>
                </g>
              )}

              {/* Screen */}
              <rect x={(roomWidth - screenW) / 2} y={screenY} width={screenW} height={12} rx={5} fill="#334155" />
              <text x={roomWidth / 2} y={screenLabelY} fontSize={13} fontWeight={700} fill={MUTED} textAnchor="middle" letterSpacing={2}>
                {screenLabelText}
              </text>

              {/* Instructor desk */}
              <rect
                x={deskX}
                y={deskY}
                width={140}
                height={46}
                rx={10}
                fill="#eef2ff"
                stroke={selectedInstructor ? BLUE : "#c7d2fe"}
                strokeWidth={selectedInstructor ? 2.5 : 2}
              />
              <text x={instCenterX} y={deskY + 28} fontSize={14} fontWeight={600} fill="#4338ca" textAnchor="middle">
                {instLabel}
              </text>

              {!isCustom && (
                <line
                  x1={24}
                  x2={roomWidth - 24}
                  y1={isBottom ? roomDepth - FRONT_ZONE + 8 : FRONT_ZONE - 8}
                  y2={isBottom ? roomDepth - FRONT_ZONE + 8 : FRONT_ZONE - 8}
                  stroke="#e2e8f0"
                  strokeWidth={2}
                  strokeDasharray="10 10"
                />
              )}
            </g>
          );
        })()}

        {/* tables */}
        {tables.map((table) => {
          const geo = tableGeometry(table);
          const cx = table.x ?? 0;
          const cy = table.y ?? 0;
          const rot = table.rotation ?? 0;
          const selected = selectedTableId === table.id;
          const filled = Array.from({ length: table.seatCount }).filter((_, i) => occupants.has(seatKey(table.id, i))).length;
          const surfaceStroke = selected ? BLUE : LINE;
          const bounds = selected ? tableBounds(table) : null;
          return (
            <g
              key={table.id}
              data-table={table.id}
              onPointerDown={onTablePointerDown ? (e) => onTablePointerDown(table.id, e) : undefined}
              style={mode === "layout" ? { cursor: "move", touchAction: "none" } : undefined}
            >
              {bounds && mode === "layout" && (
                <rect
                  x={bounds.minX - 6}
                  y={bounds.minY - 6}
                  width={bounds.maxX - bounds.minX + 12}
                  height={bounds.maxY - bounds.minY + 12}
                  rx={14}
                  fill="rgba(37,99,235,0.05)"
                  stroke={BLUE}
                  strokeWidth={2}
                  strokeDasharray="8 6"
                />
              )}
              {geo.shape === "round" && (
                <circle cx={cx} cy={cy} r={geo.width / 2} fill="#f8fafc" stroke={surfaceStroke} strokeWidth={selected ? 5 : 3} />
              )}
              {(geo.shape === "rect" || geo.shape === "row") && (
                <rect
                  x={cx - geo.width / 2}
                  y={cy - geo.height / 2}
                  width={geo.width}
                  height={geo.height}
                  rx={8}
                  fill="#f8fafc"
                  stroke={surfaceStroke}
                  strokeWidth={selected ? 5 : 3}
                  transform={rot ? `rotate(${rot} ${cx} ${cy})` : undefined}
                />
              )}
              {geo.shape === "chairs" && (
                <rect
                  x={cx - geo.width / 2 - 8}
                  y={cy - geo.height / 2}
                  width={geo.width + 16}
                  height={geo.height}
                  rx={geo.height / 2}
                  fill={selected ? "rgba(37,99,235,0.06)" : "#f8fafc"}
                  stroke={selected ? BLUE : "#e2e8f0"}
                  strokeWidth={selected ? 3 : 2}
                  strokeDasharray={selected ? undefined : "6 6"}
                  transform={rot ? `rotate(${rot} ${cx} ${cy})` : undefined}
                />
              )}
              {geo.shape !== "chairs" ? (
                <g
                  className="rp-t"
                  pointerEvents="none"
                  transform={geo.shape === "round" ? undefined : `rotate(${textRotation(rot)} ${cx} ${cy})`}
                >
                  {(() => {
                    // one-sided tables are thin: a single "Name · 3/4" line fits along them
                    const small = geo.shape === "row";
                    return (
                      <>
                        <text
                          x={cx}
                          y={cy + (small ? 5 : -2)}
                          fontSize={small ? 13 : 15}
                          fontWeight={700}
                          fill="#334155"
                          textAnchor="middle"
                        >
                          {table.name}
                          {small ? `  ·  ${filled}/${table.seatCount}` : ""}
                        </text>
                        {!small && (
                          <text x={cx} y={cy + 16} fontSize={12} fill={MUTED} textAnchor="middle">
                            {filled}/{table.seatCount} terisi
                          </text>
                        )}
                      </>
                    );
                  })()}
                </g>
              ) : (
                <text
                  className="rp-t"
                  pointerEvents="none"
                  x={cx - geo.width / 2 - 14}
                  y={cy + 5}
                  fontSize={13}
                  fontWeight={700}
                  fill="#475569"
                  textAnchor="end"
                  transform={rot ? `rotate(${rot} ${cx} ${cy})` : undefined}
                >
                  {table.name.replace(/^Baris /, "")}
                </text>
              )}
            </g>
          );
        })}

        {/* chairs + faces */}
        {tables.map((table) =>
          seatPositions(table).map((seat) => {
            const key = seatKey(table.id, seat.index);
            const occupant = occupants.get(key);
            const isDrop = dropTargetKey === key;
            const isSelected = selectedSeatKey === key;
            const dimmed = !!occupant && draggingParticipantId === occupant.participant.id;
            const highlighted = !!occupant && highlightParticipantId === occupant.participant.id;
            const clickable = interactive && mode === "assign";
            const pickTarget = clickable && !!pickedParticipantId && occupant?.participant.id !== pickedParticipantId;
            return (
              <g
                key={key}
                data-seat={key}
                transform={`translate(${seat.x} ${seat.y})`}
                opacity={dimmed ? 0.35 : 1}
                onPointerDown={clickable && onSeatPointerDown ? (e) => onSeatPointerDown(key, e) : undefined}
                onClick={clickable && onSeatClick ? (e) => onSeatClick(key, e) : undefined}
                style={clickable ? { cursor: occupant ? "grab" : "pointer", touchAction: occupant ? "none" : undefined } : undefined}
              >
                {occupant ? (
                  <OccupiedSeat
                    occupant={occupant}
                    labelMode={labelMode}
                    revealed={revealedSeatKey === key}
                    ring={isDrop ? BLUE : isSelected || highlighted ? BLUE : "#ffffff"}
                    emphasis={isDrop || isSelected || highlighted}
                    exportMode={!interactive}
                    clipId={faceClip}
                    side={labelSide(table, seat)}
                  />
                ) : (
                  <g>
                    <circle
                      r={SEAT_R}
                      fill={isDrop ? "#dbeafe" : pickTarget ? "#eff6ff" : "#ffffff"}
                      stroke={isDrop || isSelected ? BLUE : pickTarget ? "#60a5fa" : "#94a3b8"}
                      strokeWidth={isDrop || isSelected ? 3.5 : 2}
                      strokeDasharray={isDrop || isSelected ? undefined : "5 4"}
                    />
                    <text
                      className="rp-t"
                      y={4.5}
                      fontSize={isDrop ? 18 : 12}
                      fontWeight={600}
                      fill={isDrop || pickTarget ? BLUE : "#94a3b8"}
                      textAnchor="middle"
                      pointerEvents="none"
                    >
                      {isDrop || pickTarget ? "+" : seat.index + 1}
                    </text>
                  </g>
                )}
              </g>
            );
          })
        )}
      </g>

      {header && (
        <g className="rp-t">
          <text x={24} y={top + roomDepth + 36} fontSize={14} fill={MUTED}>
            Dibuat dengan Anomia · depan kelas di bagian atas denah
          </text>
        </g>
      )}
    </svg>
  );
});

function OccupiedSeat({
  occupant,
  labelMode,
  revealed,
  ring,
  emphasis,
  exportMode,
  clipId,
  side,
}: {
  occupant: SeatOccupant;
  labelMode: LabelMode;
  revealed: boolean;
  ring: string;
  emphasis: boolean;
  exportMode: boolean;
  clipId: string;
  /** where the name goes: under the face, or beside it for chairs on the left/right side of a table */
  side: "below" | "left" | "right";
}) {
  const { participant, faceUrl } = occupant;
  const hideName = labelMode === "hidden" && !revealed;
  const name = hideName ? "?" : shortName(participant.displayName, exportMode ? 16 : 13);
  const sub =
    labelMode === "name-org" && !hideName
      ? shortName(participant.organization ?? participant.jobTitle ?? "", 18)
      : "";
  const nameW = labelWidth(name, 11.5);
  const subW = sub ? labelWidth(sub, 9.5) : 0;
  const boxW = Math.max(nameW, subW);
  const boxH = sub ? 28 : 16;
  return (
    <g>
      <circle r={SEAT_R + 3.5} fill={ring} stroke={emphasis ? ring : "#cbd5e1"} strokeWidth={emphasis ? 3 : 1.5} />
      {faceUrl ? (
        <image
          href={faceUrl}
          x={-SEAT_R}
          y={-SEAT_R}
          width={SEAT_R * 2}
          height={SEAT_R * 2}
          clipPath={`url(#${clipId})`}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <>
          <circle r={SEAT_R} fill={colorFor(participant.displayName)} />
          <text className="rp-t" y={5} fontSize={14} fontWeight={700} fill="#1e3a8a" textAnchor="middle" pointerEvents="none">
            {initialsOf(participant.displayName)}
          </text>
        </>
      )}
      <g
        transform={
          side === "below"
            ? `translate(0 ${SEAT_R + 5})`
            : side === "left"
              ? `translate(${-(SEAT_R + 6 + boxW / 2)} ${-boxH / 2})`
              : `translate(${SEAT_R + 6 + boxW / 2} ${-boxH / 2})`
        }
        pointerEvents="none"
      >
        <rect x={-boxW / 2} y={0} width={boxW} height={boxH} rx={5} fill="#ffffff" fillOpacity={0.94} stroke="#e2e8f0" strokeWidth={1} />
        <text className="rp-t" y={12} fontSize={11.5} fontWeight={700} fill={hideName ? MUTED : INK} textAnchor="middle">
          {name}
        </text>
        {sub && (
          <text className="rp-t" y={24} fontSize={9.5} fill={MUTED} textAnchor="middle">
            {sub}
          </text>
        )}
      </g>
    </g>
  );
}
