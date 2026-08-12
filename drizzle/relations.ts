import { relations } from "drizzle-orm";
import { bookings, coaches, gyms, notifications, serviceTypes, timeSlots, users } from "./schema";

export const coachRelations = relations(coaches, ({ one, many }) => ({
  user: one(users, { fields: [coaches.userId], references: [users.id] }),
  slots: many(timeSlots),
}));

export const gymRelations = relations(gyms, ({ many }) => ({
  slots: many(timeSlots),
}));

export const serviceTypeRelations = relations(serviceTypes, ({ many }) => ({
  slots: many(timeSlots),
}));

export const timeSlotRelations = relations(timeSlots, ({ one, many }) => ({
  gym: one(gyms, { fields: [timeSlots.gymId], references: [gyms.id] }),
  coach: one(coaches, { fields: [timeSlots.coachId], references: [coaches.id] }),
  serviceType: one(serviceTypes, { fields: [timeSlots.serviceTypeId], references: [serviceTypes.id] }),
  bookings: many(bookings),
}));

export const bookingRelations = relations(bookings, ({ one, many }) => ({
  member: one(users, { fields: [bookings.memberUserId], references: [users.id] }),
  timeSlot: one(timeSlots, { fields: [bookings.timeSlotId], references: [timeSlots.id] }),
  checkedInByUser: one(users, { fields: [bookings.checkedInBy], references: [users.id] }),
  notifications: many(notifications),
}));

export const notificationRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  booking: one(bookings, { fields: [notifications.relatedBookingId], references: [bookings.id] }),
}));

export const userRelations = relations(users, ({ many }) => ({
  bookings: many(bookings),
  notifications: many(notifications),
  coachedBy: many(coaches),
}));
