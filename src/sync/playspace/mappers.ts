import type { Client, Appointment, SessionNote, MeetingLink } from "@/sync/types";
import type {
  PlaySpaceClientResponse,
  PlaySpaceAppointmentResponse,
  PlaySpaceSessionNoteResponse,
  PlaySpaceMeetingLinkResponse,
} from "./types";

// TODO: Implement once PlaySpace API response shapes are known

export function mapClient(_raw: PlaySpaceClientResponse): Client {
  throw new Error("Not implemented — awaiting PlaySpace API documentation");
}

export function mapAppointment(_raw: PlaySpaceAppointmentResponse): Appointment {
  throw new Error("Not implemented — awaiting PlaySpace API documentation");
}

export function mapSessionNote(_raw: PlaySpaceSessionNoteResponse): SessionNote {
  throw new Error("Not implemented — awaiting PlaySpace API documentation");
}

export function mapMeetingLink(_raw: PlaySpaceMeetingLinkResponse): MeetingLink {
  throw new Error("Not implemented — awaiting PlaySpace API documentation");
}
