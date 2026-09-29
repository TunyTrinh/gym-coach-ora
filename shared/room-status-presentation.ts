export type RoomStatusMarker =
  | "available"
  | "partially_closed"
  | "closed"
  | "temporarily_closed"
  | "full"
  | "inactive"
  | "availability_published"
  | "client_booking";

export const ROOM_STATUS_MARKER_ORDER: RoomStatusMarker[] = [
  "available",
  "partially_closed",
  "closed",
  "full",
  "inactive",
  "availability_published",
  "client_booking",
];

const ROOM_STATUS_PRESENTATION: Record<RoomStatusMarker, { color: string; background: string }> = {
  available: { color: "#5DCAA5", background: "#5DCAA51F" },
  partially_closed: { color: "#EF9F27", background: "#EF9F271F" },
  closed: { color: "#767672", background: "#7676721F" },
  temporarily_closed: { color: "#767672", background: "#7676721F" },
  full: { color: "#E2574A", background: "#E2574A1F" },
  inactive: { color: "#444441", background: "#44444166" },
  availability_published: { color: "#378ADD", background: "#378ADD1F" },
  client_booking: { color: "#7F77DD", background: "#7F77DD1F" },
};

export function roomStatusPresentation(status: RoomStatusMarker) {
  return ROOM_STATUS_PRESENTATION[status];
}

export function visibleRoomCalendarMarkers(markers: readonly string[]) {
  return ROOM_STATUS_MARKER_ORDER.filter((marker) => markers.includes(marker));
}
