import { describe, expect, it } from "vitest";

import { bookingFailureTranslationKey } from "../lib/booking-feedback";

describe("booking feedback mapping", () => {
  it("explains an overlapping client session", () => {
    expect(bookingFailureTranslationKey("This session overlaps with one of your existing bookings.")).toBe("bookingOverlap");
  });

  it("distinguishes coach and room capacity failures", () => {
    expect(bookingFailureTranslationKey("That time has reached the coach’s maximum client capacity. Choose another time.")).toBe("bookingCapacityFull");
    expect(bookingFailureTranslationKey("That room has reached its maximum client capacity. Choose another time.")).toBe("bookingRoomCapacityFull");
  });

  it("uses a safe generic explanation for unknown failures", () => {
    expect(bookingFailureTranslationKey("Unexpected upstream response")).toBe("bookingUnavailable");
  });
});
