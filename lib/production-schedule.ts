import type { GymSnapshot, BookingStatus, Role } from "@/shared/gym";

type ScheduleRow = {
  id: string;
  status: string;
  bookingTime: Date | string;
  cancellationTime: Date | string | null;
  cancellationReason: string | null;
  checkInTime: Date | string | null;
  startAt: Date | string;
  endAt: Date | string;
  room: string;
  maximumCapacity: number;
  serviceName: string;
  availabilityId: string | null;
  coachName?: string | null;
  clientId?: number;
  clientName?: string | null;
  availabilityCapacity?: number;
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "C";
}

function bookingStatus(status: string): BookingStatus {
  return ({ pending: "Pending", confirmed: "Confirmed", cancelled: "Cancelled", completed: "Completed", no_show: "No-show" } as const)[status as "pending" | "confirmed" | "cancelled" | "completed" | "no_show"] ?? "Cancelled";
}

export function adaptProductionSchedule(
  base: GymSnapshot,
  input: { role: Role; user?: { id?: number | null; name?: string | null; email?: string | null } | null; rows: ScheduleRow[] },
): GymSnapshot {
  const services = new Map<string, GymSnapshot["services"][number]>();
  const coaches = new Map<string, GymSnapshot["coaches"][number]>();
  const availability = new Map<string, GymSnapshot["availabilityShifts"][number]>();
  const slots: GymSnapshot["slots"] = [];
  const bookings: GymSnapshot["bookings"] = [];

  for (const row of input.rows) {
    const serviceId = `service-${row.serviceName.replace(/\s+/g, "-").toLowerCase()}`;
    if (!services.has(serviceId)) {
      services.set(serviceId, {
        id: serviceId,
        name: row.serviceName,
        description: "",
        durationMinutes: Math.round((new Date(row.endAt).getTime() - new Date(row.startAt).getTime()) / 60_000),
        defaultCapacity: row.maximumCapacity,
        coachRequired: true,
        cancellationWindowMinutes: 0,
      });
    }
    const coachId = row.coachName ? `coach-${row.availabilityId ?? row.id}` : undefined;
    if (coachId && !coaches.has(coachId)) {
      coaches.set(coachId, { id: coachId, fullName: row.coachName!, specialty: "", initials: initials(row.coachName!), accent: "#9660bd", active: true });
    }
    slots.push({
      id: `slot-${row.id}`,
      gymId: "database-gym",
      coachId,
      availabilityShiftId: row.availabilityId ?? undefined,
      serviceTypeId: serviceId,
      start: new Date(row.startAt).toISOString(),
      end: new Date(row.endAt).toISOString(),
      maximumCapacity: row.maximumCapacity,
      bookedCount: ["confirmed", "pending"].includes(row.status) ? 1 : 0,
      status: row.status === "completed" ? "Completed" : row.status === "cancelled" ? "Cancelled" : "Full",
      room: row.room,
    });
    bookings.push({
      id: row.id,
      memberId: input.role === "coach" ? `member-${row.clientId ?? "unknown"}` : `member-${input.user?.id ?? "anonymous"}`,
      memberName: input.role === "coach" ? row.clientName ?? undefined : undefined,
      timeSlotId: `slot-${row.id}`,
      status: bookingStatus(row.status),
      bookingTime: new Date(row.bookingTime).toISOString(),
      cancellationTime: row.cancellationTime ? new Date(row.cancellationTime).toISOString() : undefined,
      cancellationReason: row.cancellationReason ?? undefined,
      checkInTime: row.checkInTime ? new Date(row.checkInTime).toISOString() : undefined,
    });
    if (input.role === "coach" && row.availabilityId && !availability.has(row.availabilityId)) {
      availability.set(row.availabilityId, {
        id: row.availabilityId,
        gymId: "database-gym",
        coachId: "database-coach",
        serviceTypeId: serviceId,
        start: new Date(row.startAt).toISOString(),
        end: new Date(row.endAt).toISOString(),
        maximumCapacity: row.availabilityCapacity ?? row.maximumCapacity,
        location: row.room,
        status: "Available",
        createdBy: "database",
      });
    }
  }

  const fullName = input.user?.name?.trim() || "Coachora member";
  return {
    ...base,
    member: { ...base.member, id: `member-${input.user?.id ?? "anonymous"}`, fullName, email: input.user?.email ?? "", initials: initials(fullName), role: input.role },
    services: [...services.values()],
    coaches: [...coaches.values()],
    availabilityShifts: [...availability.values()],
    slots,
    bookings,
    notifications: [],
    measurements: [],
  };
}
