CREATE INDEX `availability_shifts_room_status_start_idx` ON `availabilityShifts` (`roomId`,`status`,`startAt`);--> statement-breakpoint
CREATE INDEX `bookings_time_slot_status_idx` ON `bookings` (`timeSlotId`,`status`);--> statement-breakpoint
CREATE INDEX `time_slots_room_start_idx` ON `timeSlots` (`roomId`,`startAt`);--> statement-breakpoint
CREATE INDEX `time_slots_coach_start_idx` ON `timeSlots` (`coachId`,`startAt`);