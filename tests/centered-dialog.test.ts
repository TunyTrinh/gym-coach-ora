import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const dialog = readFileSync(resolve(root, "components/centered-dialog.tsx"), "utf8");
const booking = readFileSync(resolve(root, "app/(tabs)/book.tsx"), "utf8");
const availability = readFileSync(resolve(root, "app/availability.tsx"), "utf8");
const typedConfirm = readFileSync(resolve(root, "components/typed-confirm-sheet.tsx"), "utf8");

function componentBlock(source: string, name: string) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, end === -1 ? source.length : end);
}

describe("shared centered dialog", () => {
  it("owns a full viewport instead of inheriting a card or scroll-container coordinate system", () => {
    expect(dialog).toContain('presentationStyle="overFullScreen"');
    expect(dialog).toContain("statusBarTranslucent");
    expect(dialog).toContain("navigationBarTranslucent");
    expect(dialog).toContain("viewport: { flex: 1");
    expect(dialog).toContain("backdropDismiss: { ...StyleSheet.absoluteFillObject }");
    expect(dialog).toContain('centerFrame: { flex: 1, alignItems: "center", justifyContent: "center"');
    expect(dialog).not.toContain('justifyContent: "flex-end"');
  });

  it("keeps dialog content safe-area-aware, keyboard-aware, responsive, and accessible", () => {
    expect(dialog).toContain('edges={["top", "right", "bottom", "left"]}');
    expect(dialog).toContain("KeyboardAvoidingView");
    expect(dialog).toContain('behavior={Platform.OS === "ios" ? "padding" : undefined}');
    expect(dialog).toContain('width: "100%", maxWidth: 440, maxHeight: "100%"');
    expect(dialog).toContain('paddingHorizontal: 20, paddingVertical: 20');
    expect(dialog).toContain('accessibilityRole="alert"');
  });

  it("locks PWA background scrolling for the full open-dialog lifetime and restores it afterward", () => {
    expect(dialog).toContain('body.style.overflow = "hidden"');
    expect(dialog).toContain('body.style.overscrollBehavior = "none"');
    expect(dialog).toContain("body.style.overflow = previousOverflow");
    expect(dialog).toContain("body.style.overscrollBehavior = previousOverscrollBehavior");
  });

  it("migrates booking success/error, availability success/error, and typed confirmation dialogs to the one centered foundation", () => {
    const bookingFeedback = componentBlock(booking, "BookingFeedbackSheet");
    const availabilityFeedback = componentBlock(availability, "AvailabilityFeedbackSheet");
    expect(booking).toContain('import { CenteredDialog } from "@/components/centered-dialog"');
    expect(availability).toContain('import { CenteredDialog } from "@/components/centered-dialog"');
    expect(typedConfirm).toContain('import { CenteredDialog } from "@/components/centered-dialog"');
    expect(bookingFeedback).toContain("<CenteredDialog");
    expect(bookingFeedback).not.toContain("<Modal");
    expect(availabilityFeedback).toContain("<CenteredDialog");
    expect(availabilityFeedback).not.toContain("<Modal");
    expect(typedConfirm).toContain("<CenteredDialog");
    expect(typedConfirm).not.toContain("<Modal");
  });
});
