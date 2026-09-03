export interface Person {
  id: string;
  displayName: string;
  createdAt: string;
}

export interface ClassGroup {
  id: string;
  name: string;
  createdAt: string;
}

export interface Participant {
  id: string;
  classGroupId: string;
  personId: string;
  displayName: string;
  /** true if created from roster import before any face was labeled to them */
  fromRoster: boolean;
  createdAt: string;
}
