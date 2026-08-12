import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

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

export const coaches = mysqlTable("coaches", {
  id: int("id").autoincrement().primaryKey(),
  externalId: varchar("externalId", { length: 64 }).notNull().unique(),
  userId: int("userId"),
  fullName: varchar("fullName", { length: 255 }).notNull(),
  specialty: varchar("specialty", { length: 255 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
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
  serviceTypeId: int("serviceTypeId").notNull(),
  startAt: timestamp("startAt").notNull(),
  endAt: timestamp("endAt").notNull(),
  maximumCapacity: int("maximumCapacity").notNull(),
  bookedCount: int("bookedCount").default(0).notNull(),
  status: mysqlEnum("status", ["Open", "Full", "Blocked", "Cancelled", "Completed"]).default("Open").notNull(),
  room: varchar("room", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const bookings = mysqlTable("bookings", {
  id: int("id").autoincrement().primaryKey(),
  externalId: varchar("externalId", { length: 64 }).notNull().unique(),
  memberUserId: int("memberUserId").notNull(),
  timeSlotId: int("timeSlotId").notNull(),
  status: mysqlEnum("status", ["Pending", "Confirmed", "Cancelled", "Completed", "No-show"]).default("Pending").notNull(),
  bookingTime: timestamp("bookingTime").defaultNow().notNull(),
  cancellationTime: timestamp("cancellationTime"),
  cancellationReason: text("cancellationReason"),
  checkInTime: timestamp("checkInTime"),
  checkedInBy: int("checkedInBy"),
  memberNotes: text("memberNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

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
