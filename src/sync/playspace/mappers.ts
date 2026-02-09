import type { Client, Appointment, SessionNote, MeetingLink } from "@/sync/types";
import type {
  PlaySpaceClientResponse,
  PlaySpaceAppointmentResponse,
  PlaySpaceNoteResponse,
} from "./types";

export function mapClient(raw: PlaySpaceClientResponse): Client {
  return {
    id: raw.id,
    firstName: raw.firstName,
    lastName: raw.lastName,
    preferredName: raw.preferredName || undefined,
    email: raw.email || undefined,
    phone: raw.phoneNumber || undefined,
    dateOfBirth: raw.dateOfBirth || undefined,
    city: raw.city || undefined,
    stateProvince: raw.stateProvince || undefined,
    country: raw.country || undefined,
    source: "playspace",
    sourceId: raw.id,
  };
}

export function mapAppointment(raw: PlaySpaceAppointmentResponse): Appointment {
  const statusMap: Record<string, Appointment["status"]> = {
    scheduled: "scheduled",
    completed: "completed",
    cancelled: "cancelled",
    no_show: "no-show",
  };

  return {
    id: raw.id,
    practitionerId: raw.practitionerId || undefined,
    clientId: raw.clients?.[0]?.clientId || undefined,
    name: raw.name || undefined,
    description: raw.description || undefined,
    startTime: raw.startTime,
    endTime: raw.endTime,
    duration: raw.duration,
    type: raw.typeOfSession === "in_person" ? "in-person" : "telehealth",
    status: statusMap[raw.attendanceStatus] ?? "scheduled",
    meetingLink: raw.videoMeetingUrl || undefined,
    source: "playspace",
    sourceId: raw.id,
  };
}

export function mapNote(raw: PlaySpaceNoteResponse, clientId?: string): SessionNote {
  return {
    id: raw.id,
    clientId: clientId || undefined,
    name: raw.name || undefined,
    date: raw.createdAt,
    content: raw.content ?? raw.description ?? "",
    locked: raw.locked,
    source: "playspace",
    sourceId: raw.id,
  };
}

export function mapMeetingLink(raw: PlaySpaceAppointmentResponse): MeetingLink | null {
  if (!raw.videoMeetingUrl) return null;
  return {
    id: `ml-${raw.id}`,
    appointmentId: raw.id,
    url: raw.videoMeetingUrl,
    source: "playspace",
    sourceId: `ml-${raw.id}`,
  };
}
