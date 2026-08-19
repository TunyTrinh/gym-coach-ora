import { relations } from "drizzle-orm";
import {
  auditLogs,
  availabilityShifts,
  bookings,
  coachAuthorizations,
  coachClients,
  coachNotes,
  coaches,
  gymRooms,
  gyms,
  healthMeasurements,
  notifications,
  roomClosures,
  serviceTypes,
  timeSlots,
  users,
} from "./schema";

export const userRelations = relations(users, ({ one, many }) => ({
  coachProfile: one(coaches, { fields: [users.id], references: [coaches.userId], relationName: "coach_user" }),
  bookings: many(bookings, { relationName: "booking_member" }),
  checkedInBookings: many(bookings, { relationName: "booking_check_in_actor" }),
  notifications: many(notifications),
  authoredClosures: many(roomClosures, { relationName: "room_closure_created_by" }),
  updatedClosures: many(roomClosures, { relationName: "room_closure_updated_by" }),
  createdAvailability: many(availabilityShifts, { relationName: "availability_created_by" }),
  updatedAvailability: many(availabilityShifts, { relationName: "availability_updated_by" }),
  legacyAvailabilityMemberships: many(availabilityShifts, { relationName: "availability_member" }),
  clientAssignments: many(coachClients, { relationName: "coach_client_member" }),
  assignedCoachClients: many(coachClients, { relationName: "coach_client_assigner" }),
  notesAsClient: many(coachNotes),
  healthMeasurements: many(healthMeasurements, { relationName: "health_measurement_subject" }),
  recordedHealthMeasurements: many(healthMeasurements, { relationName: "health_measurement_recorder" }),
  auditEvents: many(auditLogs, { relationName: "audit_actor" }),
  auditTargets: many(auditLogs, { relationName: "audit_target" }),
}));

export const gymRelations = relations(gyms, ({ many }) => ({
  rooms: many(gymRooms),
  coaches: many(coaches),
  slots: many(timeSlots),
  availability: many(availabilityShifts),
}));

export const gymRoomRelations = relations(gymRooms, ({ one, many }) => ({
  gym: one(gyms, { fields: [gymRooms.gymId], references: [gyms.id] }),
  closures: many(roomClosures),
  slots: many(timeSlots),
  availability: many(availabilityShifts),
}));

export const roomClosureRelations = relations(roomClosures, ({ one }) => ({
  room: one(gymRooms, { fields: [roomClosures.roomId], references: [gymRooms.id] }),
  author: one(users, { fields: [roomClosures.createdBy], references: [users.id], relationName: "room_closure_created_by" }),
  updater: one(users, { fields: [roomClosures.updatedBy], references: [users.id], relationName: "room_closure_updated_by" }),
}));

export const coachRelations = relations(coaches, ({ one, many }) => ({
  gym: one(gyms, { fields: [coaches.gymId], references: [gyms.id] }),
  user: one(users, { fields: [coaches.userId], references: [users.id], relationName: "coach_user" }),
  authorization: one(coachAuthorizations),
  slots: many(timeSlots),
  availability: many(availabilityShifts),
  clients: many(coachClients),
  notes: many(coachNotes),
}));

export const coachAuthorizationRelations = relations(coachAuthorizations, ({ one }) => ({
  coach: one(coaches, { fields: [coachAuthorizations.coachId], references: [coaches.id] }),
}));

export const serviceTypeRelations = relations(serviceTypes, ({ many }) => ({
  legacySlots: many(timeSlots),
  legacyAvailability: many(availabilityShifts),
}));

export const timeSlotRelations = relations(timeSlots, ({ one, many }) => ({
  gym: one(gyms, { fields: [timeSlots.gymId], references: [gyms.id] }),
  coach: one(coaches, { fields: [timeSlots.coachId], references: [coaches.id] }),
  room: one(gymRooms, { fields: [timeSlots.roomId], references: [gymRooms.id] }),
  legacyServiceType: one(serviceTypes, { fields: [timeSlots.serviceTypeId], references: [serviceTypes.id] }),
  bookings: many(bookings),
}));

export const availabilityShiftRelations = relations(availabilityShifts, ({ one, many }) => ({
  gym: one(gyms, { fields: [availabilityShifts.gymId], references: [gyms.id] }),
  coach: one(coaches, { fields: [availabilityShifts.coachId], references: [coaches.id] }),
  room: one(gymRooms, { fields: [availabilityShifts.roomId], references: [gymRooms.id] }),
  legacyServiceType: one(serviceTypes, { fields: [availabilityShifts.serviceTypeId], references: [serviceTypes.id] }),
  legacyMember: one(users, { fields: [availabilityShifts.memberUserId], references: [users.id], relationName: "availability_member" }),
  legacyBooking: one(bookings, { fields: [availabilityShifts.bookingId], references: [bookings.id], relationName: "availability_legacy_booking" }),
  creator: one(users, { fields: [availabilityShifts.createdBy], references: [users.id], relationName: "availability_created_by" }),
  updater: one(users, { fields: [availabilityShifts.updatedBy], references: [users.id], relationName: "availability_updated_by" }),
  bookings: many(bookings, { relationName: "booking_availability" }),
}));

export const bookingRelations = relations(bookings, ({ one, many }) => ({
  member: one(users, { fields: [bookings.memberUserId], references: [users.id], relationName: "booking_member" }),
  timeSlot: one(timeSlots, { fields: [bookings.timeSlotId], references: [timeSlots.id] }),
  availability: one(availabilityShifts, { fields: [bookings.availabilityShiftId], references: [availabilityShifts.id], relationName: "booking_availability" }),
  checkedInByUser: one(users, { fields: [bookings.checkedInBy], references: [users.id], relationName: "booking_check_in_actor" }),
  legacyAvailability: many(availabilityShifts, { relationName: "availability_legacy_booking" }),
  notifications: many(notifications),
}));

export const notificationRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  booking: one(bookings, { fields: [notifications.relatedBookingId], references: [bookings.id] }),
}));

export const coachClientRelations = relations(coachClients, ({ one }) => ({
  coach: one(coaches, { fields: [coachClients.coachId], references: [coaches.id] }),
  client: one(users, { fields: [coachClients.clientUserId], references: [users.id], relationName: "coach_client_member" }),
  assignedByUser: one(users, { fields: [coachClients.assignedBy], references: [users.id], relationName: "coach_client_assigner" }),
}));

export const coachNoteRelations = relations(coachNotes, ({ one }) => ({
  coach: one(coaches, { fields: [coachNotes.coachId], references: [coaches.id] }),
  client: one(users, { fields: [coachNotes.clientUserId], references: [users.id] }),
}));

export const healthMeasurementRelations = relations(healthMeasurements, ({ one }) => ({
  user: one(users, { fields: [healthMeasurements.userId], references: [users.id], relationName: "health_measurement_subject" }),
  recorder: one(users, { fields: [healthMeasurements.recordedBy], references: [users.id], relationName: "health_measurement_recorder" }),
}));

export const auditLogRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorUserId], references: [users.id], relationName: "audit_actor" }),
  target: one(users, { fields: [auditLogs.targetUserId], references: [users.id], relationName: "audit_target" }),
}));
