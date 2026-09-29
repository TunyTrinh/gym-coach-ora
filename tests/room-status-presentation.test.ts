import { describe, expect, it } from "vitest";

import { roomStatusPresentation, visibleRoomCalendarMarkers } from "../shared/room-status-presentation";

describe("room status presentation", () => {
  it("uses the shared requested status palette across dots, pills, and selectors", () => {
    expect(roomStatusPresentation("available").color).toBe("#5DCAA5");
    expect(roomStatusPresentation("partially_closed").color).toBe("#EF9F27");
    expect(roomStatusPresentation("closed").color).toBe("#767672");
    expect(roomStatusPresentation("full").color).toBe("#E2574A");
    expect(roomStatusPresentation("inactive").color).toBe("#444441");
    expect(roomStatusPresentation("availability_published").color).toBe("#378ADD");
    expect(roomStatusPresentation("client_booking").color).toBe("#7F77DD");
  });

  it("deduplicates and orders calendar statuses before the UI caps them at three dots", () => {
    expect(visibleRoomCalendarMarkers(["client_booking", "available", "available", "full", "inactive"])).toEqual([
      "available",
      "full",
      "inactive",
      "client_booking",
    ]);
  });
});
