export type Role = "client" | "coach" | "admin";
export type BookingStatus = "Pending" | "Confirmed" | "Cancelled" | "Completed" | "No-show";
export type SlotStatus = "Open" | "Full" | "Blocked" | "Cancelled" | "Completed";
export type AvailabilityShiftStatus = "Available" | "Booked" | "Blocked" | "Completed" | "Cancelled" | "Expired";
export type NotificationType = "confirmation" | "reminder" | "announcement" | "cancellation" | "membership";

export interface Gym {
  id: string;
  name: string;
  address: string;
  phone: string;
  timezone: string;
  active: boolean;
}

export interface Coach {
  id: string;
  fullName: string;
  specialty: string;
  initials: string;
  accent: string;
  active: boolean;
}

export interface TimeSlot {
  id: string;
  gymId: string;
  coachId?: string;
  /** Managed room identifier, preserved for room-aware Admin preview synchronization. */
  roomId?: string;
  /** Present when this booked session belongs to a coach availability window. */
  availabilityShiftId?: string;
  start: string;
  end: string;
  maximumCapacity: number;
  bookedCount: number;
  status: SlotStatus;
  room: string;
}

export interface AvailabilityShift {
  id: string;
  gymId: string;
  coachId: string;
  roomId?: string;
  start: string;
  end: string;
  /** Concurrent client capacity for any overlapping interval inside this window. */
  maximumCapacity: number;
  /** Authoritative room limit used to prevent Coach sessions exceeding shared room occupancy. */
  roomMaximumCapacity?: number;
  timeZone?: string;
  location: string;
  note?: string;
  status: AvailabilityShiftStatus;
  createdBy: string;
  updatedBy?: string;
  recurrenceGroupId?: string;
  memberId?: string;
  bookingId?: string;
}

export interface AvailabilityCreateInput {
  coachId: string | number;
  startDate: string;
  startTime: string;
  endTime: string;
  maximumCapacity: number;
  roomId?: string | number;
  note?: string;
}

export interface Booking {
  id: string;
  memberId: string;
  /** Display name captured when a session is booked so a coach schedule can identify the client. */
  memberName?: string;
  timeSlotId: string;
  status: BookingStatus;
  bookingTime: string;
  /** Selected by the client for bookings made inside a continuous availability window. */
  durationMinutes?: number;
  cancellationTime?: string;
  cancellationReason?: string;
  checkInTime?: string;
  checkedInBy?: string;
  memberNotes?: string;
}

export interface MemberProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  membershipPlan: string;
  membershipEndDate: string;
  role: Role;
  initials: string;
}

export const HEALTH_MEASUREMENT_KEYS = ["weightKg", "bodyFatPercentage", "chestCm", "waistCm", "hipsCm", "armsCm", "thighsCm"] as const;
export type HealthMeasurementKey = (typeof HEALTH_MEASUREMENT_KEYS)[number];

export interface HealthMeasurementRecord {
  id: string;
  recordedAt: string;
  weightKg?: number;
  bodyFatPercentage?: number;
  chestCm?: number;
  waistCm?: number;
  hipsCm?: number;
  armsCm?: number;
  thighsCm?: number;
}

export type HealthMeasurementInput = Omit<HealthMeasurementRecord, "id">;

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  relatedBookingId?: string;
  priority?: "Normal" | "Important" | "Urgent";
  audience?: "client" | "coach" | "all";
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: "Normal" | "Important" | "Urgent";
  publishedAt: string;
}

export interface GymSnapshot {
  gyms: Gym[];
  coaches: Coach[];
  slots: TimeSlot[];
  availabilityShifts: AvailabilityShift[];
  bookings: Booking[];
  member: MemberProfile;
  measurements: HealthMeasurementRecord[];
  notifications: NotificationItem[];
  announcements: Announcement[];
}

export const formatTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));

export const formatShortDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));

export const formatDateLabel = (value: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));

export const getCoach = (snapshot: GymSnapshot, coachId?: string) => snapshot.coaches.find((coach) => coach.id === coachId);
export const getSlot = (snapshot: GymSnapshot, slotId: string) => snapshot.slots.find((slot) => slot.id === slotId);
export const getBookingSlot = (snapshot: GymSnapshot, booking: Booking) => getSlot(snapshot, booking.timeSlotId);
