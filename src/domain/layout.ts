export interface RoomLayout {
  id: string;
  classGroupId: string;
  name: string;
  rows: number;
  cols: number;
  createdAt: string;
}

export interface Seat {
  id: string;
  roomLayoutId: string;
  row: number;
  col: number;
  label: string | null;
}

export interface SeatingPlan {
  id: string;
  roomLayoutId: string;
  label: string;
  effectiveFrom: string;
}

export interface SeatAssignment {
  id: string;
  seatingPlanId: string;
  seatId: string;
  participantId: string;
}
