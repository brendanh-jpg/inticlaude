export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  notes?: string;
  source: "playspace";
  sourceId: string;
}

export interface Appointment {
  id: string;
  clientId: string;
  therapistId?: string;
  startTime: string;
  endTime: string;
  type: "in-person" | "video" | "phone";
  status: "scheduled" | "completed" | "cancelled" | "no-show";
  meetingLink?: string;
  location?: string;
  source: "playspace";
  sourceId: string;
}

export interface SessionNote {
  id: string;
  clientId: string;
  appointmentId?: string;
  date: string;
  content: string;
  type?: string;
  goals?: string[];
  interventions?: string[];
  source: "playspace";
  sourceId: string;
}

export interface MeetingLink {
  id: string;
  appointmentId: string;
  url: string;
  provider?: string;
  expiresAt?: string;
  source: "playspace";
  sourceId: string;
}

export interface SyncResult {
  entity: "client" | "appointment" | "sessionNote" | "meetingLink";
  sourceId: string;
  action: "created" | "updated" | "skipped" | "failed";
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
