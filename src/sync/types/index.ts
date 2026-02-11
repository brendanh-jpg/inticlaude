export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  city?: string;
  stateProvince?: string;
  country?: string;
  notes?: string;
  source: "playspace";
  sourceId: string;
}

export interface Appointment {
  id: string;
  clientId?: string;
  clientFirstName?: string;
  clientLastName?: string;
  practitionerId?: string;
  name?: string;
  description?: string;
  startTime: string;
  endTime: string;
  duration?: number;
  type: "in-person" | "telehealth";
  status: "scheduled" | "completed" | "cancelled" | "no-show";
  meetingLink?: string;
  playspaceUrl?: string;
  source: "playspace";
  sourceId: string;
}

export interface SessionNote {
  id: string;
  clientId?: string;
  appointmentId?: string;
  name?: string;
  date: string;
  content: string;
  locked?: boolean;
  source: "playspace";
  sourceId: string;
}

export type EntityType = "client" | "appointment" | "sessionNote";

export interface SyncResult {
  entity: EntityType;
  sourceId: string;
  action: "created" | "updated" | "skipped" | "failed";
  owlReference?: string;
  error?: string;
  timestamp: string;
}

export interface SyncRunSummary {
  runId: string;
  startedAt: string;
  completedAt: string;
  results: SyncResult[];
  counts: {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
}
