"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { localStore } from "@/store/localStore";
import type { ClassGroup, Participant } from "@/domain/participant";
import type { SeatAssignment, SeatingDay, SeatingTable, TableLayoutTemplate } from "@/domain/layout";
import { LAYOUT_TEMPLATES, layoutTemplateMeta } from "./layoutTemplates";
import { StepFooterNav } from "./StepFooterNav";

function seatPosition(index: number, count: number) {
  const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
  const radius = 42;
  const left = 50 + radius * Math.cos(angle);
  const top = 50 + radius * Math.sin(angle);
  return { left: `${left}%`, top: `${top}%` };
}

export function SeatingStep({ classGroupId }: { classGroupId: string }) {
  const [classGroup, setClassGroup] = useState<ClassGroup | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [days, setDays] = useState<SeatingDay[]>([]);
  const [activeDayId, setActiveDayId] = useState<string | null>(null);
  const [tables, setTables] = useState<SeatingTable[]>([]);
  const [assignments, setAssignments] = useState<SeatAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const creatingDefaultDayRef = useRef(false);

  const reloadDays = useCallback(async () => {
    try {
      const [cg, parts, seatingDays] = await Promise.all([
        localStore.getClassGroup(classGroupId),
        localStore.listParticipants(classGroupId),
        localStore.listSeatingDays(classGroupId),
      ]);
      setClassGroup(cg ?? null);
      setParticipants(parts);

      let finalDays = seatingDays;
      if (finalDays.length === 0 && cg && !creatingDefaultDayRef.current) {
        creatingDefaultDayRef.current = true;
        await localStore.createSeatingDay(classGroupId, "Day 1: Ice Breaking", cg.tableLayout);
        // Re-read from the DB rather than trusting the locally-created row —
        // keeps `days` consistent with whatever actually landed in IndexedDB.
        finalDays = await localStore.listSeatingDays(classGroupId);
      }
      setDays(finalDays);
      setActiveDayId((current) => current ?? finalDays[0]?.id ?? null);
    } catch (err) {
      console.error("SeatingStep reloadDays failed", err);
    } finally {
      setLoading(false);
    }
  }, [classGroupId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reloadDays();
  }, [reloadDays]);

  const reloadDayContents = useCallback(async () => {
    if (!activeDayId) return;
    const [tbls, asgs] = await Promise.all([
      localStore.listSeatingTables(activeDayId),
      localStore.listSeatAssignments(activeDayId),
    ]);
    setTables(tbls);
    setAssignments(asgs);
  }, [activeDayId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reloadDayContents();
  }, [reloadDayContents]);

  const activeDay = days.find((d) => d.id === activeDayId) ?? null;

  const participantById = useMemo(() => {
    const map = new Map<string, Participant>();
    for (const p of participants) map.set(p.id, p);
    return map;
  }, [participants]);

  const seatedParticipantIds = useMemo(() => new Set(assignments.map((a) => a.participantId)), [assignments]);
  const unseated = participants.filter((p) => !seatedParticipantIds.has(p.id));

  const assignmentBySeat = useMemo(() => {
    const map = new Map<string, SeatAssignment>();
    for (const a of assignments) map.set(`${a.seatingTableId}:${a.seatIndex}`, a);
    return map;
  }, [assignments]);

  const totalSeats = tables.reduce((sum, t) => sum + t.seatCount, 0);
  const filledSeats = assignments.length;

  async function handleAddDay() {
    const label = window.prompt("Nama hari baru:", `Day ${days.length + 1}`);
    if (!label) return;
    const created = await localStore.createSeatingDay(classGroupId, label, classGroup?.tableLayout ?? "banquet");
    setDays((d) => [...d, created]);
    setActiveDayId(created.id);
  }

  async function handleSetTemplate(template: TableLayoutTemplate) {
    if (!activeDay) return;
    await localStore.updateSeatingDay(activeDay.id, { layoutTemplate: template });
    setDays((d) => d.map((day) => (day.id === activeDay.id ? { ...day, layoutTemplate: template } : day)));
  }

  async function handleAddTable() {
    if (!activeDay) return;
    const meta = layoutTemplateMeta(activeDay.layoutTemplate);
    await localStore.createSeatingTable(activeDay.id, `Meja ${tables.length + 1}`, meta.defaultSeatCount);
    await reloadDayContents();
  }

  async function handleToggleLock() {
    if (!activeDay) return;
    const locked = !activeDay.locked;
    await localStore.updateSeatingDay(activeDay.id, { locked });
    setDays((d) => d.map((day) => (day.id === activeDay.id ? { ...day, locked } : day)));
  }

  async function handleAutoAssign() {
    if (!activeDay) return;
    await localStore.autoAssignSeats(activeDay.id);
    await reloadDayContents();
  }

  async function handleShuffle() {
    if (!activeDay) return;
    await localStore.shuffleSeats(activeDay.id);
    await reloadDayContents();
  }

  async function handleDropOnSeat(tableId: string, seatIndex: number, participantId: string) {
    if (activeDay?.locked) return;
    await localStore.assignSeat(tableId, seatIndex, participantId);
    await reloadDayContents();
  }

  if (loading || !activeDay) {
    return <div className="px-layout-gutter-desktop py-space-xl text-body-sm text-on-surface-variant">Memuat…</div>;
  }

  return (
    <div className="w-full px-layout-gutter-mobile md:px-layout-gutter-desktop py-space-md space-y-space-md">
      <div className="bg-surface-card rounded-xl p-space-md shadow-sm flex flex-col xl:flex-row items-start xl:items-center justify-between gap-space-md no-print">
        <div className="flex flex-wrap items-center gap-space-sm">
          <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Sesi Pelatihan:</span>
          <div className="inline-flex p-1 bg-surface-slate rounded-lg gap-1 flex-wrap">
            {days.map((day) => (
              <button
                key={day.id}
                type="button"
                onClick={() => setActiveDayId(day.id)}
                className={`px-space-md py-1.5 rounded-md font-label-md text-label-md transition-all ${
                  day.id === activeDayId
                    ? "bg-primary-container text-on-primary-container shadow-xs"
                    : "text-on-surface-variant hover:bg-surface-container"
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleAddDay}
            className="inline-flex items-center gap-1 px-space-sm py-1.5 rounded-md bg-surface-container-low text-primary hover:bg-surface-container font-label-md text-label-md transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>Tambah Hari</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-space-xs">
          <button
            type="button"
            onClick={handleShuffle}
            disabled={activeDay.locked}
            className="inline-flex items-center gap-1.5 px-space-md py-2 rounded-md bg-surface-slate hover:bg-surface-container text-on-surface font-label-md text-label-md transition-all shadow-xs disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-accent-violet text-[18px]">shuffle</span>
            <span>Acak / Rotasi Kursi</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-space-md py-2 rounded-md bg-surface-slate hover:bg-surface-container text-on-surface font-label-md text-label-md transition-all shadow-xs"
          >
            <span className="material-symbols-outlined text-[18px]">print</span>
            <span>Cetak Denah</span>
          </button>
          <button
            type="button"
            onClick={handleToggleLock}
            className={`inline-flex items-center gap-1.5 px-space-md py-2 rounded-md font-label-md text-label-md transition-colors shadow-xs ${
              activeDay.locked ? "bg-confidence-high text-on-primary" : "bg-primary text-on-primary hover:bg-primary-container"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{activeDay.locked ? "lock" : "done_all"}</span>
            <span>{activeDay.locked ? "Terkunci" : "Kunci Penempatan"}</span>
          </button>
        </div>
      </div>

      <div className="bg-surface-card rounded-xl p-space-md shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md no-print">
        <div className="flex items-center gap-space-sm">
          <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[20px]">space_dashboard</span>
          </div>
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface leading-tight">Denah &amp; Penempatan Peserta</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Pilih salah satu dari 6 pedoman ruangan, atau Custom Layout.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-surface-slate rounded-xl border border-border-subtle">
          {LAYOUT_TEMPLATES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => handleSetTemplate(t.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-label-md text-label-md transition-all ${
                activeDay.layoutTemplate === t.value
                  ? "bg-surface-card text-primary shadow-xs"
                  : "text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md items-start">
        <div className="lg:col-span-8 xl:col-span-9 bg-surface-card rounded-2xl p-space-lg shadow-sm">
          {!activeDay.locked && (
            <div className="mb-space-md no-print">
              <button
                type="button"
                onClick={handleAddTable}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-slate hover:bg-surface-container border border-border-subtle text-on-surface font-label-sm text-label-sm shadow-xs transition-colors"
              >
                <span className="material-symbols-outlined text-primary text-[16px]">add_circle</span>
                <span>+ Tambah Meja (Pod)</span>
              </button>
            </div>
          )}

          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-x-space-2xl gap-y-space-2xl">
            {tables.map((table) => (
              <div key={table.id} className="bg-surface-slate/60 rounded-2xl p-space-md flex flex-col items-center">
                <div className="w-full flex items-center justify-between mb-space-sm px-2">
                  <span className="font-headline-sm text-headline-sm text-primary font-bold">{table.name}</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant bg-surface-card px-2 py-0.5 rounded-full shadow-xs">
                    {Array.from({ length: table.seatCount }).filter((_, i) => assignmentBySeat.has(`${table.id}:${i}`)).length}
                    {" / "}
                    {table.seatCount} Terisi
                  </span>
                </div>
                <div className="relative w-64 h-64 flex items-center justify-center my-2">
                  <div className="absolute w-24 h-24 rounded-2xl bg-surface-card shadow-md flex items-center justify-center border-2 border-primary/30 z-0">
                    <span className="font-body-sm text-body-sm text-outline text-center px-1">{table.name}</span>
                  </div>
                  {Array.from({ length: table.seatCount }).map((_, seatIndex) => {
                    const pos = seatPosition(seatIndex, table.seatCount);
                    const assignment = assignmentBySeat.get(`${table.id}:${seatIndex}`);
                    const participant = assignment ? participantById.get(assignment.participantId) : null;
                    return (
                      <div
                        key={seatIndex}
                        className="absolute flex flex-col items-center"
                        style={{ left: pos.left, top: pos.top, transform: "translate(-50%, -50%)" }}
                        draggable={!activeDay.locked && !!participant}
                        onDragStart={(e) => {
                          if (participant) e.dataTransfer.setData("text/participant-id", participant.id);
                        }}
                        onDragOver={(e) => {
                          if (!activeDay.locked) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const participantId = e.dataTransfer.getData("text/participant-id");
                          if (participantId) handleDropOnSeat(table.id, seatIndex, participantId);
                        }}
                      >
                        {participant ? (
                          <>
                            <div className="w-11 h-11 rounded-full bg-surface-container-high shadow-md border-2 border-primary flex items-center justify-center text-primary font-label-sm text-label-sm font-bold cursor-grab active:cursor-grabbing">
                              {participant.displayName.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-label-sm text-label-sm text-on-surface mt-1 bg-surface-card/90 px-1.5 py-0.2 rounded shadow-xs whitespace-nowrap max-w-[90px] truncate">
                              {participant.displayName}
                            </span>
                          </>
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-surface-card shadow-inner flex items-center justify-center border-2 border-dashed border-primary/40 text-primary">
                            <span className="material-symbols-outlined text-[18px]">add</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {tables.length === 0 && (
            <p className="text-sm text-on-surface-variant py-space-lg text-center">
              Belum ada meja. Klik &quot;+ Tambah Meja (Pod)&quot; untuk mulai menempatkan peserta.
            </p>
          )}

          <div className="w-full mt-space-lg pt-space-md border-t border-border-subtle flex flex-wrap items-center justify-between gap-space-sm text-body-sm font-body-sm text-on-surface-variant">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary text-[16px]">drag_indicator</span>
              Drag &amp; drop peserta ke kursi kosong
            </span>
            <span className="font-label-sm text-label-sm text-outline">Kapasitas Maksimal: {totalSeats} Peserta</span>
          </div>
        </div>

        <div className="lg:col-span-4 xl:col-span-3 space-y-space-md no-print">
          <div className="bg-surface-card rounded-2xl p-space-md shadow-sm space-y-space-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Keterisian Kelas</h3>
              <span className="px-2 py-0.5 rounded-full text-label-sm font-label-sm bg-surface-container-high text-primary font-bold">
                {filledSeats} / {totalSeats} Kursi
              </span>
            </div>
            <div className="w-full bg-surface-slate h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-500"
                style={{ width: totalSeats ? `${(filledSeats / totalSeats) * 100}%` : "0%" }}
              />
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Tersisa <strong className="text-on-surface">{unseated.length} peserta</strong> yang belum dialokasikan ke meja pada sesi{" "}
              <strong className="text-primary">{activeDay.label}</strong>.
            </p>
            <button
              type="button"
              onClick={handleAutoAssign}
              disabled={activeDay.locked || unseated.length === 0}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 py-2.5 px-space-md rounded-xl bg-primary text-on-primary hover:bg-primary-container disabled:opacity-40 transition-all font-label-md text-label-md shadow-xs"
            >
              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
              <span>Tempatkan Semua Otomatis</span>
            </button>
          </div>

          <div className="bg-surface-card rounded-2xl p-space-md shadow-sm space-y-space-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-confidence-medium text-[20px]">person_pin</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Peserta Belum Duduk</h3>
              </div>
              <span className="w-6 h-6 rounded-full bg-confidence-medium/20 text-confidence-medium flex items-center justify-center font-label-sm text-label-sm font-bold">
                {unseated.length}
              </span>
            </div>
            {unseated.length === 0 ? (
              <p className="text-body-sm font-body-sm text-confidence-high py-2 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px]">check_circle</span> Semua peserta telah duduk!
              </p>
            ) : (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Tarik kartu peserta ke kursi kosong meja manapun di kanvas:
              </p>
            )}
            <div className="space-y-2 pt-1">
              {unseated.map((p) => (
                <div
                  key={p.id}
                  draggable={!activeDay.locked}
                  onDragStart={(e) => e.dataTransfer.setData("text/participant-id", p.id)}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-surface-slate hover:bg-surface-container-high cursor-grab active:cursor-grabbing transition-all border border-border-subtle"
                >
                  <div className="min-w-0">
                    <div className="font-label-md text-label-md text-on-surface truncate">{p.displayName}</div>
                    {p.organization && (
                      <div className="font-body-sm text-body-sm text-outline truncate">{p.organization}</div>
                    )}
                  </div>
                  <span className="material-symbols-outlined text-outline text-[18px]">drag_handle</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="no-print">
        <StepFooterNav
          backHref={`/classes/${classGroupId}/labeling`}
          backLabel="Kembali ke Labeling Wajah (3)"
          nextHref="/"
          nextLabel="Selesai: Kembali ke Semua Kelas"
        />
      </div>
    </div>
  );
}
