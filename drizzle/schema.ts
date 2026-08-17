import { boolean, date, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

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
});

/** An Admin-managed physical training room within a gym. */
export const gymRooms = mysqlTable("gymRooms", {
  id: int("id").autoincrement().primaryKey(),
  externalId: varchar("externalId", { length: 64 }).notNull().unique(),
  gymId: int("gymId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  nameNormalized: varchar("nameNormalized", { length: 128 }).notNull(),
  address: text("address").notNull(),
  description: text("description").notNull(),
  maximumCapacity: int("maximumCapacity").notNull(),
  openingTime: varchar("openingTime", { length: 5 }).default("00:00").notNull(),
  closingTime: varchar("closingTime", { length: 5 }).default("23:59").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  gymRoomNameUnique: uniqueIndex("gym_rooms_gym_name_unique").on(table.gymId, table.nameNormalized),
	gymRoomActiveIndex: index("gym_rooms_gym_active_idx").on(table.gymId, table.active),
}));

/** An Admin-recorded temporary closure for one physical room on one calendar date. */
export const roomClosures = mysqlTable("roomClosures", {
	id: int("id").autoincrement().primaryKey(),
	roomId: int("roomId").notNull(),
	closureDate: date("closureDate", { mode: "string" }).notNull(),
	reason: text("reason"),
	createdBy: int("createdBy").notNull(),
	createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
	roomClosureDateUnique: uniqueIndex("room_closures_room_date_unique").on(table.roomId, table.closureDate),
	roomClosureDateIndex: index("room_closures_date_idx").on(table.closureDate),
}));

export const coaches = mysqlTable("coaches", {
  id: int("id").autoincrement().primaryKey(),
  externalId: varchar("externalId", { length: 64 }).notNull().unique(),
  gymId: int("gymId"),
  userId: int("userId"),
  fullName: varchar("fullName", { length: 255 }).notNull(),
  specialty: varchar("specialty", { length: 255 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const coachAuthorizations = mysqlTable("coachAuthorizations", {
  id: int("id").autoincrement().primaryKey(),
  coachId: int("coachId").notNull().unique(),
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
  gymId: int("gymId").notNull(),
  coachId: int("coachId"),
  roomId: int("roomId"),
  /** Optional for standalone room-access bookings. */
  serviceTypeId: int("serviceTypeId"),
  startAt: timestamp("startAt").notNull(),
  endAt: timestamp("endAt").notNull(),
  maximumCapacity: int("maximumCapacity").notNull(),
  bookedCount: int("bookedCount").default(0).notNull(),
  status: mysqlEnum("status", ["Open", "Full", "Blocked", "Cancelled", "Completed"]).default("Open").notNull(),
  room: varchar("room", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const availabilityShifts = mysqlTable("availabilityShifts", {
  id: int("id").autoincrement().primaryKey(),
  externalId: varchar("externalId", { length: 64 }).notNull().unique(),
  gymId: int("gymId").notNull(),
  coachId: int("coachId").notNull(),
  roomId: int("roomId"),
  /** Services are selected at Coach-led booking time, not while publishing availability. */
  serviceTypeId: int("serviceTypeId"),
  startAt: timestamp("startAt").notNull(),
  endAt: timestamp("endAt").notNull(),
  maximumCapacity: int("maximumCapacity").default(1).notNull(),
  location: varchar("location", { length: 128 }).notNull(),
  note: text("note"),
  status: mysqlEnum("status", ["available", "booked", "blocked", "completed", "cancelled", "expired"]).default("available").notNull(),
  memberUserId: int("memberUserId"),
  bookingId: int("bookingId"),
  createdBy: int("createdBy").notNull(),
  updatedBy: int("updatedBy"),
  recurrenceGroupId: varchar("recurrenceGroupId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  coachStartIndex: index("availability_shifts_coach_start_idx").on(table.coachId, table.startAt),
  statusStartIndex: index("availability_shifts_status_start_idx").on(table.status, table.startAt),
  roomStartIndex: index("availability_shifts_room_start_idx").on(table.roomId, table.startAt),
}));

export const bookings = mysqlTable("bookings", {
  id: int("id").autoincrement().primaryKey(),
  externalId: varchar("externalId", { length: 64 }).notNull().unique(),
  memberUserId: int("memberUserId").notNull(),
  timeSlotId: int("timeSlotId").notNull(),
  availabilityShiftId: int("availabilityShiftId"),
  status: mysqlEnum("status", ["pending", "confirmed", "cancelled", "completed", "no_show"]).default("pending").notNull(),
  bookingTime: timestamp("bookingTime").defaultNow().notNull(),
  cancellationTime: timestamp("cancellationTime"),
  cancellationReason: text("cancellationReason"),
  checkInTime: timestamp("checkInTime"),
  checkedInBy: int("checkedInBy"),
  memberNotes: text("memberNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  availabilityStatusSlotIndex: index("bookings_availability_status_slot_idx").on(table.availabilityShiftId, table.status, table.timeSlotId),
  memberStatusSlotIndex: index("bookings_member_status_slot_idx").on(table.memberUserId, table.status, table.timeSlotId),
}));

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["confirmation", "reminder", "announcement", "cancellation", "membership"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  relatedBookingId: int("relatedBookingId"),
  priority: mysqlEnum("priority", ["Normal", "Important", "Urgent"]).default("Normal").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const coachClients = mysqlTable("coachClients", {
  id: int("id").autoincrement().primaryKey(),
  coachId: int("coachId").notNull(),
  clientUserId: int("clientUserId").notNull(),
  isPrimary: boolean("isPrimary").default(true).notNull(),
  assignedBy: int("assignedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const coachNotes = mysqlTable("coachNotes", {
  id: int("id").autoincrement().primaryKey(),
  coachId: int("coachId").notNull(),
  clientUserId: int("clientUserId").notNull(),
  note: text("note").notNull(),
  isPrivate: boolean("isPrivate").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const healthMeasurements = mysqlTable("healthMeasurements", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  weight: int("weight"), // stored as grams or float representation if needed, or keep float/number
  bodyFat: int("bodyFat"),
  chest: int("chest"),
  waist: int("waist"),
  hips: int("hips"),
  arms: int("arms"),
  thighs: int("thighs"),
  recordedBy: int("recordedBy").notNull(),
  measurementDate: timestamp("measurementDate").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").autoincrement().primaryKey(),
  actorUserId: int("actorUserId").notNull(),
  action: varchar("action", { length: 255 }).notNull(),
  targetUserId: int("targetUserId"),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

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
