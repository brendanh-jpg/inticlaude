// Raw API response types from PlaySpace Partner API
// Docs: https://playspace-health.docs.buildwithfern.com/partner-api

export interface PlaySpacePagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface PlaySpaceMeta {
  requestId: string;
  timestamp: string;
}

export interface PlaySpaceListResponse<T> {
  data: T[];
  meta: PlaySpaceMeta;
  pagination: PlaySpacePagination;
}

export interface PlaySpacePractitionerResponse {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  timezone: string;
  practiceSize: "solo" | "small" | "medium" | "large";
  onboarded: boolean;
  country: string;
  region: string;
  locality: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlaySpaceClientResponse {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  email: string;
  phoneNumber: string;
  dateOfBirth: string;
  timezone: string;
  city: string;
  stateProvince: string;
  country: string;
  isArchived: boolean;
  requiresCaregiver: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlaySpaceAppointmentClient {
  id: string;
  clientId: string;
  firstName: string;
  lastName: string;
  attendanceStatus: string;
}

export interface PlaySpaceAppointmentResponse {
  id: string;
  practitionerId: string;
  name: string;
  description: string;
  startTime: string;
  endTime: string;
  duration: number;
  timezone: string;
  typeOfSession: "in_person" | "telehealth";
  attendanceStatus: "scheduled" | "completed" | "cancelled" | "no_show";
  videoMeetingUrl: string;
  priceAmount: number;
  priceCurrency: string;
  bookingReference: string;
  bookingStatus: string;
  createdAt: string;
  updatedAt: string;
  clients?: PlaySpaceAppointmentClient[];
}

export interface PlaySpaceNoteResponse {
  id: string;
  name: string;
  description: string;
  locked: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  content?: string;
}

export interface PlaySpaceFormResponse {
  id: string;
  name: string;
  description: string;
  status: "draft" | "published";
  published: string;
  publishedAt: string;
  fieldCount: number;
  createdAt: string;
  updatedAt: string;
}
