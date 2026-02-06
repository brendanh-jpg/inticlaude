// Raw API response types from PlaySpace
// TODO: Fill in once PlaySpace API documentation is available

export interface PlaySpaceClientResponse {
  // TODO: Map from actual PlaySpace API response
}

export interface PlaySpaceAppointmentResponse {
  // TODO: Map from actual PlaySpace API response
}

export interface PlaySpaceSessionNoteResponse {
  // TODO: Map from actual PlaySpace API response
}

export interface PlaySpaceMeetingLinkResponse {
  // TODO: Map from actual PlaySpace API response
}

export interface PlaySpaceListResponse<T> {
  data: T[];
  pagination?: {
    page: number;
    totalPages: number;
    totalCount: number;
  };
}
