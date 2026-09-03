export type TableLayoutTemplate =
  | "banquet"
  | "classroom"
  | "conference"
  | "hollow-square"
  | "theater"
  | "ushape"
  | "custom";

export interface SeatingDay {
  id: string;
  classGroupId: string;
  label: string;
  order: number;
  layoutTemplate: TableLayoutTemplate;
  locked: boolean;
  createdAt: string;
}

export interface SeatingTable {
  id: string;
  seatingDayId: string;
  name: string;
  seatCount: number;
  order: number;
}

export interface SeatAssignment {
  id: string;
  seatingTableId: string;
  seatIndex: number;
  participantId: string;
}
