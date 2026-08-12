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

export interface ServiceType {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  defaultCapacity: number;
  coachRequired: boolean;
  price?: number;
  cancellationWindowMinutes: number;
}

export interface TimeSlot {
  id: string;
  gymId: string;
  coachId?: string;
  /** Present when this booked session belongs to a coach availability window. */
  availabilityShiftId?: string;
  serviceTypeId: string;
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
  serviceTypeId: string;
  start: string;
  end: string;
  /** Concurrent client capacity for any overlapping interval inside this window. */
  maximumCapacity: number;
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
  /** Retained for service metadata; coach publication no longer asks for it. */
  serviceTypeId?: string | number;
  startDate: string;
  startTime: string;
  endTime: string;
  maximumCapacity: number;
  location: string;
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
  services: ServiceType[];
  slots: TimeSlot[];
  availabilityShifts: AvailabilityShift[];
  bookings: Booking[];
  member: MemberProfile;
  measurements: HealthMeasurementRecord[];
  notifications: NotificationItem[];
  announcements: Announcement[];
}

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);
const atDay = (base: Date, dayOffset: number, hour: number, minute = 0) => {
  const date = new Date(base);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date;
};

export const iso = (date: Date) => date.toISOString();

export function seedGymData(now = new Date()): GymSnapshot {
  const gym: Gym = {
    id: "gym-downtown",
    name: "Northstar Downtown",
    address: "214 Mercer Street, Austin",
    phone: "+1 (512) 555-0188",
    timezone: "America/Chicago",
    active: true,
  };

  const coaches: Coach[] = [
    { id: "coach-maya", fullName: "Maya Chen", specialty: "Strength & mobility", initials: "MC", accent: "#f0a77a", active: true },
    { id: "coach-jordan", fullName: "Jordan Brooks", specialty: "Conditioning & boxing", initials: "JB", accent: "#7dd3c7", active: true },
  ];

  const services: ServiceType[] = [
    { id: "service-strength", name: "Strength Training", description: "Build confidence with a focused strength session.", durationMinutes: 60, defaultCapacity: 8, coachRequired: true, price: 38, cancellationWindowMinutes: 120 },
    { id: "service-yoga", name: "Yoga Flow", description: "A grounded mobility flow for every level.", durationMinutes: 45, defaultCapacity: 18, coachRequired: true, price: 22, cancellationWindowMinutes: 90 },
    { id: "service-open", name: "Open Gym", description: "Train independently with full floor access.", durationMinutes: 90, defaultCapacity: 24, coachRequired: false, cancellationWindowMinutes: 60 },
  ];

  const slotBlueprints = [
    { day: 0, hour: 6, minute: 30, serviceTypeId: "service-open", coachId: undefined, room: "Main floor", capacity: 24 },
    { day: 0, hour: 18, minute: 0, serviceTypeId: "service-strength", coachId: "coach-maya", room: "Studio A", capacity: 8 },
    { day: 1, hour: 7, minute: 0, serviceTypeId: "service-yoga", coachId: "coach-jordan", room: "Studio B", capacity: 18 },
    { day: 1, hour: 12, minute: 30, serviceTypeId: "service-open", coachId: undefined, room: "Main floor", capacity: 24 },
    { day: 1, hour: 18, minute: 30, serviceTypeId: "service-strength", coachId: "coach-maya", room: "Studio A", capacity: 8 },
    { day: 2, hour: 6, minute: 30, serviceTypeId: "service-strength", coachId: "coach-jordan", room: "Studio B", capacity: 8 },
    { day: 2, hour: 17, minute: 30, serviceTypeId: "service-yoga", coachId: "coach-maya", room: "Studio B", capacity: 18 },
    { day: 3, hour: 9, minute: 0, serviceTypeId: "service-open", coachId: undefined, room: "Main floor", capacity: 24 },
    { day: 3, hour: 18, minute: 0, serviceTypeId: "service-strength", coachId: "coach-jordan", room: "Studio A", capacity: 8 },
    { day: 4, hour: 7, minute: 30, serviceTypeId: "service-yoga", coachId: "coach-maya", room: "Studio B", capacity: 18 },
    { day: 5, hour: 10, minute: 0, serviceTypeId: "service-open", coachId: undefined, room: "Main floor", capacity: 24 },
    { day: 6, hour: 16, minute: 30, serviceTypeId: "service-strength", coachId: "coach-maya", room: "Studio A", capacity: 8 },
  ];

  const slots: TimeSlot[] = slotBlueprints.map((blueprint, index) => {
    let start = atDay(now, blueprint.day + 1, blueprint.hour, blueprint.minute);
    if (index === 0) start = addMinutes(now, 90);
    const service = services.find((item) => item.id === blueprint.serviceTypeId)!;
    const bookedCount = index === 1 ? 5 : index === 4 ? 7 : index === 6 ? 13 : index === 8 ? 8 : index % 3 === 0 ? 4 : 2;
    return {
      id: `slot-${index + 1}`,
      gymId: gym.id,
      coachId: blueprint.coachId,
      serviceTypeId: blueprint.serviceTypeId,
      start: iso(start),
      end: iso(addMinutes(start, service.durationMinutes)),
      maximumCapacity: blueprint.capacity,
      bookedCount,
      status: bookedCount >= blueprint.capacity ? "Full" : "Open",
      room: blueprint.room,
    };
  });

  const bookedSlot = slots[4];
  const booking: Booking = {
    id: "booking-1001",
    memberId: "member-demo",
    timeSlotId: bookedSlot.id,
    status: "Confirmed",
    bookingTime: iso(addMinutes(now, -45)),
  };
  bookedSlot.bookedCount += 1;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 2);
  const coachAvailabilityBlueprints = [
    { day: 1, startHour: 8, endHour: 21, coachId: "coach-maya", serviceTypeId: "service-strength", room: "Gym floor 2", note: "Strength and mobility sessions", maximumCapacity: 3 },
    { day: 2, startHour: 9, endHour: 18, coachId: "coach-jordan", serviceTypeId: "service-strength", room: "Studio B", note: "Online coaching is available", maximumCapacity: 2 },
    { day: 3, startHour: 10, endHour: 20, coachId: "coach-maya", serviceTypeId: "service-strength", room: "Studio A", note: "Form-focused sessions", maximumCapacity: 3 },
  ];

  const historySlot: TimeSlot = {
    id: "slot-history-1",
    gymId: gym.id,
    coachId: "coach-jordan",
    serviceTypeId: "service-strength",
    start: iso(atDay(yesterday, 0, 18, 0)),
    end: iso(atDay(yesterday, 0, 19, 0)),
    maximumCapacity: 8,
    bookedCount: 6,
    status: "Completed",
    room: "Studio A",
  };
  const secondHistorySlot: TimeSlot = {
    id: "slot-history-2",
    gymId: gym.id,
    coachId: "coach-maya",
    serviceTypeId: "service-yoga",
    start: iso(atDay(yesterday, -3, 7, 0)),
    end: iso(atDay(yesterday, -3, 7, 45)),
    maximumCapacity: 18,
    bookedCount: 12,
    status: "Completed",
    room: "Studio B",
  };
  slots.push(historySlot, secondHistorySlot);

  const availabilityShifts: AvailabilityShift[] = coachAvailabilityBlueprints.map((blueprint, index) => {
    const start = atDay(now, blueprint.day + 1, blueprint.startHour, 0);
    const end = atDay(now, blueprint.day + 1, blueprint.endHour, 0);
    return {
      id: `availability-seed-${index + 1}`,
      gymId: gym.id,
      coachId: blueprint.coachId,
      serviceTypeId: blueprint.serviceTypeId,
      start: iso(start),
      end: iso(end),
      maximumCapacity: blueprint.maximumCapacity,
      location: blueprint.room,
      note: blueprint.note,
      status: "Available",
      createdBy: blueprint.coachId,
    };
  });

  return {
    gyms: [gym],
    coaches,
    services,
    slots,
    availabilityShifts,
    bookings: [
      booking,
      { id: "booking-1002", memberId: "member-demo", timeSlotId: historySlot.id, status: "Completed", bookingTime: iso(atDay(yesterday, 0, 10, 0)), checkInTime: iso(atDay(yesterday, 0, 17, 46)), checkedInBy: "member-demo" },
      { id: "booking-1003", memberId: "member-demo", timeSlotId: secondHistorySlot.id, status: "Cancelled", bookingTime: iso(atDay(yesterday, -3, 6, 0)), cancellationTime: iso(atDay(yesterday, -2, 12, 0)), cancellationReason: "Travel plans changed" },
    ],
    member: {
      id: "member-demo",
      fullName: "Alex Morgan",
      email: "alex.morgan@example.com",
      phone: "+1 (512) 555-0134",
      membershipPlan: "Northstar Unlimited",
      membershipEndDate: iso(atDay(now, 42, 12, 0)),
      role: "client",
      initials: "AM",
    },
    measurements: [
      { id: "measurement-1", recordedAt: iso(atDay(now, -56, 9, 0)), weightKg: 78.4, bodyFatPercentage: 22.8, chestCm: 101, waistCm: 88, hipsCm: 102, armsCm: 33, thighsCm: 60 },
      { id: "measurement-2", recordedAt: iso(atDay(now, -28, 9, 0)), weightKg: 77.2, bodyFatPercentage: 21.9, chestCm: 101.5, waistCm: 86.5, hipsCm: 101, armsCm: 33.4, thighsCm: 59.5 },
      { id: "measurement-3", recordedAt: iso(atDay(now, -2, 9, 0)), weightKg: 76.6, bodyFatPercentage: 21.1, chestCm: 102, waistCm: 85, hipsCm: 100.5, armsCm: 33.8, thighsCm: 59 },
    ],
    notifications: [
      { id: "note-1", type: "reminder", title: "Your session is tomorrow", message: "Strength Training with Maya Chen starts at 6:30 PM in Studio A.", createdAt: iso(addMinutes(now, -30)), read: false, relatedBookingId: booking.id, priority: "Important" },
      { id: "note-2", type: "announcement", title: "New recovery zone", message: "The recovery zone is now open on the mezzanine level after 5 PM.", createdAt: iso(addMinutes(now, -180)), read: false, priority: "Normal" },
      { id: "note-3", type: "membership", title: "Membership is active", message: "Your Northstar Unlimited membership renews in 42 days.", createdAt: iso(addMinutes(now, -1440)), read: true, priority: "Normal" },
    ],
    announcements: [
      { id: "announce-1", title: "Recovery zone is open", message: "Drop in after your workout for guided stretching and percussion therapy.", priority: "Important", publishedAt: iso(addMinutes(now, -120)) },
    ],
  };
}

export const formatTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));

export const formatShortDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));

export const formatDateLabel = (value: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));

export const getService = (snapshot: GymSnapshot, serviceTypeId: string) => snapshot.services.find((service) => service.id === serviceTypeId);
export const getCoach = (snapshot: GymSnapshot, coachId?: string) => snapshot.coaches.find((coach) => coach.id === coachId);
export const getSlot = (snapshot: GymSnapshot, slotId: string) => snapshot.slots.find((slot) => slot.id === slotId);
export const getBookingSlot = (snapshot: GymSnapshot, booking: Booking) => getSlot(snapshot, booking.timeSlotId);
