import { sql } from "drizzle-orm";
import { type AnyMySqlColumn, boolean, check, date, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  emailNormalized: varchar("emailNormalized", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  role: mysqlEnum("role", ["client", "coach", "admin"]).default("client").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
}, (table) => ({
  normalizedEmailIndex: uniqueIndex("users_email_normalized_unique").on(table.emailNormalized),
}));

export const gyms = mysqlTable("gyms", {
  id: int("id").autoincrement().primaryKey(),
  externalId: varchar("externalId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address").notNull(),
  phone: varchar("phone", { length: 32 }),
  timezone: varchar("timezone", { length: 64 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  activeCheck: check("gyms_active_check", sql`${table.active} in (0, 1)`),
}));

/** An Admin-managed physical training room within a gym. */
export const gymRooms = mysqlTable("gymRooms", {
  id: int("id").autoincrement().primaryKey(),
  externalId: varchar("externalId", { length: 64 }).notNull().unique(),
  gymId: int("gymId").notNull().references(() => gyms.id, { onDelete: "no action", onUpdate: "no action" }),
  name: varchar("name", { length: 128 }).notNull(),
  nameNormalized: varchar("nameNormalized", { length: 128 }).notNull(),
  address: text("address").notNull(),
  description: text("description").notNull(),
  maximumCapacity: int("maximumCapacity").notNull(),
  openingTime: varchar("openingTime", { length: 5 }).default("00:00").notNull(),
  closingTime: varchar("closingTime", { length: 5 }).default("23:59").notNull(),
  active: boolean("active").default(true).notNull(),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  gymRoomNameUnique: uniqueIndex("gym_rooms_gym_name_unique").on(table.gymId, table.nameNormalized),
  gymRoomActiveIndex: index("gym_rooms_gym_active_idx").on(table.gymId, table.active),
  maximumCapacityCheck: check("gym_rooms_capacity_check", sql`${table.maximumCapacity} between 1 and 500`),
  openingHoursCheck: check(
    "gym_rooms_hours_check",
    sql`${table.openingTime} regexp '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${table.closingTime} regexp '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${table.openingTime} < ${table.closingTime}`,
  ),
  activeCheck: check("gym_rooms_active_check", sql`${table.active} in (0, 1)`),
}));

/** An Admin-recorded temporary closure for one physical room on one calendar date. */
export const roomClosures = mysqlTable("roomClosures", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull().references(() => gymRooms.id, { onDelete: "no action", onUpdate: "no action" }),
  closureDate: date("closureDate", { mode: "string" }).notNull(),
  reason: text("reason"),
  createdBy: int("createdBy").notNull().references(() => users.id, { onDelete: "no action", onUpdate: "no action" }),
  updatedBy: int("updatedBy").references(() => users.id, { onDelete: "no action", onUpdate: "no action" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  roomClosureDateUnique: uniqueIndex("room_closures_room_date_unique").on(table.roomId, table.closureDate),
  roomClosureDateIndex: index("room_closures_date_idx").on(table.closureDate),
}));

export const coaches = mysqlTable("coaches", {
  id: int("id").autoincrement().primaryKey(),
  externalId: varchar("externalId", { length: 64 }).notNull().unique(),
  gymId: int("gymId").references(() => gyms.id, { onDelete: "no action", onUpdate: "no action" }),
  userId: int("userId").references(() => users.id, { onDelete: "no action", onUpdate: "no action" }),
  fullName: varchar("fullName", { length: 255 }).notNull(),
  specialty: varchar("specialty", { length: 255 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userUnique: uniqueIndex("coaches_user_unique").on(table.userId),
  activeNameIndex: index("coaches_active_name_idx").on(table.active, table.fullName),
  activeCheck: check("coaches_active_check", sql`${table.active} in (0, 1)`),
}));

export const coachAuthorizations = mysqlTable("coachAuthorizations", {
  id: int("id").autoincrement().primaryKey(),
  coachId: int("coachId").notNull().unique().references(() => coaches.id, { onDelete: "no action", onUpdate: "no action" }),
  normalizedEmail: varchar("normalizedEmail", { length: 320 }).notNull().unique(),
  status: mysqlEnum("status", ["authorized", "revoked", "disabled"]).default("authorized").notNull(),
  authorizedAt: timestamp("authorizedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const serviceTypes = mysqlTable("serviceTypes", {
  id: int("id").autoincrement().primaryKey(),
  externalId: varchar("externalId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  durationMinutes: int("durationMinutes").notNull(),
  defaultCapacity: int("defaultCapacity").notNull(),
  coachRequired: boolean("coachRequired").default(false).notNull(),
  cancellationWindowMinutes: int("cancellationWindowMinutes").notNull(),
  priceCents: int("priceCents"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const timeSlots = mysqlTable("timeSlots", {
  id: int("id").autoincrement().primaryKey(),
  externalId: varchar("externalId", { length: 64 }).notNull().unique(),
  gymId: int("gymId").notNull().references(() => gyms.id, { onDelete: "no action", onUpdate: "no action" }),
  coachId: int("coachId").references(() => coaches.id, { onDelete: "no action", onUpdate: "no action" }),
  roomId: int("roomId").references(() => gymRooms.id, { onDelete: "no action", onUpdate: "no action" }),
  /** Legacy-only reference. New room and Coach bookings always store null. */
  serviceTypeId: int("serviceTypeId").references(() => serviceTypes.id, { onDelete: "no action", onUpdate: "no action" }),
  startAt: timestamp("startAt").notNull(),
  endAt: timestamp("endAt").notNull(),
  maximumCapacity: int("maximumCapacity").notNull(),
  bookedCount: int("bookedCount").default(0).notNull(),
  status: mysqlEnum("status", ["Open", "Full", "Blocked", "Cancelled", "Completed"]).default("Open").notNull(),
  room: varchar("room", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  roomStartIndex: index("time_slots_room_start_idx").on(table.roomId, table.startAt),
  coachStartIndex: index("time_slots_coach_start_idx").on(table.coachId, table.startAt),
  intervalCheck: check("time_slots_interval_check", sql`${table.endAt} > ${table.startAt}`),
  capacityCheck: check("time_slots_capacity_check", sql`${table.maximumCapacity} > 0`),
  bookedCountCheck: check("time_slots_booked_count_check", sql`${table.bookedCount} between 0 and ${table.maximumCapacity}`),
}));

export const availabilityShifts = mysqlTable("availabilityShifts", {
  id: int("id").autoincrement().primaryKey(),
  externalId: varchar("externalId", { length: 64 }).notNull().unique(),
  gymId: int("gymId").notNull().references(() => gyms.id, { onDelete: "no action", onUpdate: "no action" }),
  coachId: int("coachId").notNull().references(() => coaches.id, { onDelete: "no action", onUpdate: "no action" }),
  roomId: int("roomId").references(() => gymRooms.id, { onDelete: "no action", onUpdate: "no action" }),
  /** Legacy-only reference. Publishing and booking availability are service-free. */
  serviceTypeId: int("serviceTypeId").references(() => serviceTypes.id, { onDelete: "no action", onUpdate: "no action" }),
  startAt: timestamp("startAt").notNull(),
  endAt: timestamp("endAt").notNull(),
  maximumCapacity: int("maximumCapacity").default(1).notNull(),
  location: varchar("location", { length: 128 }).notNull(),
  note: text("note"),
  status: mysqlEnum("status", ["available", "booked", "blocked", "completed", "cancelled", "expired"]).default("available").notNull(),
  memberUserId: int("memberUserId").references(() => users.id, { onDelete: "no action", onUpdate: "no action" }),
  bookingId: int("bookingId").references((): AnyMySqlColumn => bookings.id, { onDelete: "no action", onUpdate: "no action" }),
  createdBy: int("createdBy").notNull().references(() => users.id, { onDelete: "no action", onUpdate: "no action" }),
  updatedBy: int("updatedBy").references(() => users.id, { onDelete: "no action", onUpdate: "no action" }),
  recurrenceGroupId: varchar("recurrenceGroupId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  coachStartIndex: index("availability_shifts_coach_start_idx").on(table.coachId, table.startAt),
  statusStartIndex: index("availability_shifts_status_start_idx").on(table.status, table.startAt),
  roomStartIndex: index("availability_shifts_room_start_idx").on(table.roomId, table.startAt),
  roomStatusStartIndex: index("availability_shifts_room_status_start_idx").on(table.roomId, table.status, table.startAt),
  intervalCheck: check("availability_shifts_interval_check", sql`${table.endAt} > ${table.startAt}`),
  capacityCheck: check("availability_shifts_capacity_check", sql`${table.maximumCapacity} between 1 and 12`),
}));

export const bookings = mysqlTable("bookings", {
  id: int("id").autoincrement().primaryKey(),
  externalId: varchar("externalId", { length: 64 }).notNull().unique(),
  memberUserId: int("memberUserId").notNull().references(() => users.id, { onDelete: "no action", onUpdate: "no action" }),
  timeSlotId: int("timeSlotId").notNull().references(() => timeSlots.id, { onDelete: "no action", onUpdate: "no action" }),
  availabilityShiftId: int("availabilityShiftId").references(() => availabilityShifts.id, { onDelete: "no action", onUpdate: "no action" }),
  status: mysqlEnum("status", ["pending", "confirmed", "cancelled", "completed", "no_show"]).default("pending").notNull(),
  bookingTime: timestamp("bookingTime").defaultNow().notNull(),
  cancellationTime: timestamp("cancellationTime"),
  cancellationReason: text("cancellationReason"),
  checkInTime: timestamp("checkInTime"),
  checkedInBy: int("checkedInBy").references(() => users.id, { onDelete: "no action", onUpdate: "no action" }),
  memberNotes: text("memberNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  availabilityStatusSlotIndex: index("bookings_availability_status_slot_idx").on(table.availabilityShiftId, table.status, table.timeSlotId),
  memberStatusSlotIndex: index("bookings_member_status_slot_idx").on(table.memberUserId, table.status, table.timeSlotId),
  timeSlotStatusIndex: index("bookings_time_slot_status_idx").on(table.timeSlotId, table.status),
}));

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "no action", onUpdate: "no action" }),
  type: mysqlEnum("type", ["confirmation", "reminder", "announcement", "cancellation", "membership"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  relatedBookingId: int("relatedBookingId").references(() => bookings.id, { onDelete: "no action", onUpdate: "no action" }),
  priority: mysqlEnum("priority", ["Normal", "Important", "Urgent"]).default("Normal").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userCreatedIndex: index("notifications_user_created_idx").on(table.userId, table.createdAt),
  readCheck: check("notifications_read_check", sql`${table.read} in (0, 1)`),
}));

export const coachClients = mysqlTable("coachClients", {
  id: int("id").autoincrement().primaryKey(),
  coachId: int("coachId").notNull().references(() => coaches.id, { onDelete: "no action", onUpdate: "no action" }),
  clientUserId: int("clientUserId").notNull().references(() => users.id, { onDelete: "no action", onUpdate: "no action" }),
  isPrimary: boolean("isPrimary").default(true).notNull(),
  assignedBy: int("assignedBy").references(() => users.id, { onDelete: "no action", onUpdate: "no action" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  coachClientUnique: uniqueIndex("coach_clients_coach_client_unique").on(table.coachId, table.clientUserId),
  primaryCheck: check("coach_clients_primary_check", sql`${table.isPrimary} in (0, 1)`),
}));

export const coachNotes = mysqlTable("coachNotes", {
  id: int("id").autoincrement().primaryKey(),
  coachId: int("coachId").notNull().references(() => coaches.id, { onDelete: "no action", onUpdate: "no action" }),
  clientUserId: int("clientUserId").notNull().references(() => users.id, { onDelete: "no action", onUpdate: "no action" }),
  note: text("note").notNull(),
  isPrivate: boolean("isPrivate").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  coachClientCreatedIndex: index("coach_notes_coach_client_created_idx").on(table.coachId, table.clientUserId, table.createdAt),
  privateCheck: check("coach_notes_private_check", sql`${table.isPrivate} in (0, 1)`),
}));

export const healthMeasurements = mysqlTable("healthMeasurements", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "no action", onUpdate: "no action" }),
  /** Tenths of kilograms; API field is weightKg. */
  weight: int("weight"),
  /** Tenths of a percentage point; API field is bodyFatPercentage. */
  bodyFat: int("bodyFat"),
  /** Remaining body measurements are stored in tenths of a centimetre. */
  chest: int("chest"),
  waist: int("waist"),
  hips: int("hips"),
  arms: int("arms"),
  thighs: int("thighs"),
  recordedBy: int("recordedBy").notNull().references(() => users.id, { onDelete: "no action", onUpdate: "no action" }),
  measurementDate: timestamp("measurementDate").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userMeasurementDateIndex: index("health_measurements_user_date_idx").on(table.userId, table.measurementDate),
  valueRangeCheck: check(
    "health_measurements_value_range_check",
    sql`(${table.weight} is null or ${table.weight} between 1 and 5000) and (${table.bodyFat} is null or ${table.bodyFat} between 1 and 1000) and (${table.chest} is null or ${table.chest} between 1 and 4000) and (${table.waist} is null or ${table.waist} between 1 and 4000) and (${table.hips} is null or ${table.hips} between 1 and 4000) and (${table.arms} is null or ${table.arms} between 1 and 2000) and (${table.thighs} is null or ${table.thighs} between 1 and 3000)`,
  ),
  atLeastOneValueCheck: check(
    "health_measurements_value_required_check",
    sql`${table.weight} is not null or ${table.bodyFat} is not null or ${table.chest} is not null or ${table.waist} is not null or ${table.hips} is not null or ${table.arms} is not null or ${table.thighs} is not null`,
  ),
}));

export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").autoincrement().primaryKey(),
  actorUserId: int("actorUserId").notNull().references(() => users.id, { onDelete: "no action", onUpdate: "no action" }),
  action: varchar("action", { length: 255 }).notNull(),
  targetUserId: int("targetUserId").references(() => users.id, { onDelete: "no action", onUpdate: "no action" }),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  createdAtIndex: index("audit_logs_created_idx").on(table.createdAt),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Gym = typeof gyms.$inferSelect;
export type InsertGym = typeof gyms.$inferInsert;
export type Coach = typeof coaches.$inferSelect;
export type InsertCoach = typeof coaches.$inferInsert;
export type ServiceType = typeof serviceTypes.$inferSelect;
export type InsertServiceType = typeof serviceTypes.$inferInsert;
export type TimeSlot = typeof timeSlots.$inferSelect;
export type InsertTimeSlot = typeof timeSlots.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = typeof bookings.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
export type GymRoom = typeof gymRooms.$inferSelect;
export type InsertGymRoom = typeof gymRooms.$inferInsert;
export type RoomClosure = typeof roomClosures.$inferSelect;
export type InsertRoomClosure = typeof roomClosures.$inferInsert;
export type CoachAuthorization = typeof coachAuthorizations.$inferSelect;
export type InsertCoachAuthorization = typeof coachAuthorizations.$inferInsert;
export type AvailabilityShift = typeof availabilityShifts.$inferSelect;
export type InsertAvailabilityShift = typeof availabilityShifts.$inferInsert;
export type CoachClient = typeof coachClients.$inferSelect;
export type InsertCoachClient = typeof coachClients.$inferInsert;
export type CoachNote = typeof coachNotes.$inferSelect;
export type InsertCoachNote = typeof coachNotes.$inferInsert;
export type HealthMeasurement = typeof healthMeasurements.$inferSelect;
export type InsertHealthMeasurement = typeof healthMeasurements.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
