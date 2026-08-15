import { describe, expect, it } from "vitest";

import { canEditAvailabilityShift, createAvailabilityWindow, intervalFitsAvailability, intervalsOverlap, shiftDisplayStatus } from "../lib/availability-shifts";
import type { AvailabilityShift } from "../shared/gym";

const baseInput = {
  coachId: "coach-maya",
  startDate: "2026-08-17",
  startTime: "09:00",
  endTime: "21:00",
  maximumCapacity: 3,
  roomId: "room-studio-a",
  location: "Studio A",
};

function shift(overrides: Partial<AvailabilityShift> = {}): AvailabilityShift {
  return {
    id: "availability-test",
    gymId: "gym-apex",
    createdBy: "coach-maya",
    coachId: "coach-maya",
    serviceTypeId: "service-pt",
    start: "2026-08-17T09:00:00.000Z",
    end: "2026-08-17T10:00:00.000Z",
    maximumCapacity: 3,
    location: "Studio A",
    status: "Available",
    ...overrides,
  };
}

describe("continuous coach availability", () => {
  it("publishes one continuous availability window rather than generated shifts", () => {
    const window = createAvailabilityWindow(baseInput);
    expect(window).toEqual({ start: "2026-08-17T09:00:00.000Z", end: "2026-08-17T21:00:00.000Z" });
  });

  it("refuses a window whose end does not follow its start", () => {
    expect(createAvailabilityWindow({ ...baseInput, startTime: "21:00", endTime: "09:00" })).toBeNull();
    expect(createAvailabilityWindow({ ...baseInput, startTime: "not-a-time" })).toBeNull();
  });

  it("refuses an availability window that is not assigned to a room", () => {
    expect(createAvailabilityWindow({ ...baseInput, roomId: undefined })).toBeNull();
  });

  it("recognizes only real interval conflicts so adjacent sessions remain bookable", () => {
    expect(intervalsOverlap("2026-08-17T09:00:00.000Z", "2026-08-17T10:00:00.000Z", "2026-08-17T09:30:00.000Z", "2026-08-17T10:30:00.000Z")).toBe(true);
    expect(intervalsOverlap("2026-08-17T09:00:00.000Z", "2026-08-17T10:00:00.000Z", "2026-08-17T10:00:00.000Z", "2026-08-17T11:00:00.000Z")).toBe(false);
  });

  it("allows a Client session to end exactly at the Coach availability boundary, but not after it", () => {
    const availableStart = "2026-08-17T09:00:00.000Z";
    const availableEnd = "2026-08-17T12:00:00.000Z";
    expect(intervalFitsAvailability("2026-08-17T11:15:00.000Z", "2026-08-17T12:00:00.000Z", availableStart, availableEnd)).toBe(true);
    expect(intervalFitsAvailability("2026-08-17T11:30:00.000Z", "2026-08-17T12:15:00.000Z", availableStart, availableEnd)).toBe(false);
  });

  it("marks elapsed availability as expired and prevents its future management", () => {
    const now = new Date("2026-08-17T11:00:00.000Z");
    const elapsed = shift();
    const future = shift({ start: "2026-08-17T12:00:00.000Z", end: "2026-08-17T13:00:00.000Z" });
    expect(shiftDisplayStatus(elapsed, now)).toBe("Expired");
    expect(canEditAvailabilityShift(elapsed, now)).toBe(false);
    expect(canEditAvailabilityShift(future, now)).toBe(true);
  });
});
