import type { TableLayoutTemplate } from "./layout";

export interface Person {
  id: string;
  displayName: string;
  createdAt: string;
}

export interface ClassGroup {
  id: string;
  name: string;
  scheduleLabel: string | null;
  room: string | null;
  estimatedParticipants: number | null;
  tableLayout: TableLayoutTemplate;
  createdAt: string;
}

export interface Participant {
  id: string;
  classGroupId: string;
  personId: string;
  displayName: string;
  organization: string | null;
  /** true if created from roster import before any face was labeled to them */
  fromRoster: boolean;
  createdAt: string;
}
