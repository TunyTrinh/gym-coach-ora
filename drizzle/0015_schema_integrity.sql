DROP PROCEDURE IF EXISTS `coachora_preflight_0015`;--> statement-breakpoint
CREATE PROCEDURE `coachora_preflight_0015`()
BEGIN
	IF EXISTS (SELECT 1 FROM `coachClients` GROUP BY `coachId`, `clientUserId` HAVING COUNT(*) > 1 LIMIT 1) THEN
		SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '0015 preflight: duplicate Coach/Client assignments';
	END IF;
	IF EXISTS (SELECT 1 FROM `coaches` WHERE `userId` IS NOT NULL GROUP BY `userId` HAVING COUNT(*) > 1 LIMIT 1) THEN
		SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '0015 preflight: one user is linked to multiple Coach profiles';
	END IF;
	IF EXISTS (SELECT 1 FROM `availabilityShifts` WHERE `endAt` <= `startAt` OR `maximumCapacity` NOT BETWEEN 1 AND 12 LIMIT 1) THEN
		SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '0015 preflight: invalid availability interval or capacity';
	END IF;
	IF EXISTS (SELECT 1 FROM `timeSlots` WHERE `endAt` <= `startAt` OR `maximumCapacity` <= 0 OR `bookedCount` NOT BETWEEN 0 AND `maximumCapacity` LIMIT 1) THEN
		SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '0015 preflight: invalid time-slot interval or capacity';
	END IF;
	IF EXISTS (SELECT 1 FROM `gymRooms` WHERE `maximumCapacity` NOT BETWEEN 1 AND 500 OR `openingTime` NOT REGEXP '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR `closingTime` NOT REGEXP '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR `openingTime` >= `closingTime` LIMIT 1) THEN
		SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '0015 preflight: invalid room capacity or opening hours';
	END IF;
	IF EXISTS (SELECT 1 FROM `healthMeasurements` WHERE (`weight` IS NULL AND `bodyFat` IS NULL AND `chest` IS NULL AND `waist` IS NULL AND `hips` IS NULL AND `arms` IS NULL AND `thighs` IS NULL) OR NOT ((`weight` IS NULL OR `weight` BETWEEN 1 AND 5000) AND (`bodyFat` IS NULL OR `bodyFat` BETWEEN 1 AND 1000) AND (`chest` IS NULL OR `chest` BETWEEN 1 AND 4000) AND (`waist` IS NULL OR `waist` BETWEEN 1 AND 4000) AND (`hips` IS NULL OR `hips` BETWEEN 1 AND 4000) AND (`arms` IS NULL OR `arms` BETWEEN 1 AND 2000) AND (`thighs` IS NULL OR `thighs` BETWEEN 1 AND 3000)) LIMIT 1) THEN
		SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '0015 preflight: invalid or empty health measurement';
	END IF;
	IF EXISTS (SELECT 1 FROM `gyms` WHERE `active` NOT IN (0, 1) LIMIT 1)
		OR EXISTS (SELECT 1 FROM `gymRooms` WHERE `active` NOT IN (0, 1) LIMIT 1)
		OR EXISTS (SELECT 1 FROM `coaches` WHERE `active` NOT IN (0, 1) LIMIT 1)
		OR EXISTS (SELECT 1 FROM `coachClients` WHERE `isPrimary` NOT IN (0, 1) LIMIT 1)
		OR EXISTS (SELECT 1 FROM `coachNotes` WHERE `isPrivate` NOT IN (0, 1) LIMIT 1)
		OR EXISTS (SELECT 1 FROM `notifications` WHERE `read` NOT IN (0, 1) LIMIT 1) THEN
		SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '0015 preflight: invalid boolean representation';
	END IF;
	IF EXISTS (SELECT 1 FROM `auditLogs` child LEFT JOIN `users` parent ON parent.`id` = child.`actorUserId` WHERE parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `auditLogs` child LEFT JOIN `users` parent ON parent.`id` = child.`targetUserId` WHERE child.`targetUserId` IS NOT NULL AND parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `roomClosures` child LEFT JOIN `gymRooms` parent ON parent.`id` = child.`roomId` WHERE parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `roomClosures` child LEFT JOIN `users` parent ON parent.`id` = child.`createdBy` WHERE parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `gymRooms` child LEFT JOIN `gyms` parent ON parent.`id` = child.`gymId` WHERE parent.`id` IS NULL LIMIT 1) THEN
		SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '0015 preflight: orphan in audit, closure, or room data';
	END IF;
	IF EXISTS (SELECT 1 FROM `coaches` child LEFT JOIN `gyms` parent ON parent.`id` = child.`gymId` WHERE child.`gymId` IS NOT NULL AND parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `coaches` child LEFT JOIN `users` parent ON parent.`id` = child.`userId` WHERE child.`userId` IS NOT NULL AND parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `coachAuthorizations` child LEFT JOIN `coaches` parent ON parent.`id` = child.`coachId` WHERE parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `coachClients` child LEFT JOIN `coaches` parent ON parent.`id` = child.`coachId` WHERE parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `coachClients` child LEFT JOIN `users` parent ON parent.`id` = child.`clientUserId` WHERE parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `coachClients` child LEFT JOIN `users` parent ON parent.`id` = child.`assignedBy` WHERE child.`assignedBy` IS NOT NULL AND parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `coachNotes` child LEFT JOIN `coaches` parent ON parent.`id` = child.`coachId` WHERE parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `coachNotes` child LEFT JOIN `users` parent ON parent.`id` = child.`clientUserId` WHERE parent.`id` IS NULL LIMIT 1) THEN
		SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '0015 preflight: orphan in Coach data';
	END IF;
	IF EXISTS (SELECT 1 FROM `availabilityShifts` child LEFT JOIN `gyms` parent ON parent.`id` = child.`gymId` WHERE parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `availabilityShifts` child LEFT JOIN `coaches` parent ON parent.`id` = child.`coachId` WHERE parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `availabilityShifts` child LEFT JOIN `gymRooms` parent ON parent.`id` = child.`roomId` WHERE child.`roomId` IS NOT NULL AND parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `availabilityShifts` child LEFT JOIN `serviceTypes` parent ON parent.`id` = child.`serviceTypeId` WHERE child.`serviceTypeId` IS NOT NULL AND parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `availabilityShifts` child LEFT JOIN `users` parent ON parent.`id` = child.`memberUserId` WHERE child.`memberUserId` IS NOT NULL AND parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `availabilityShifts` child LEFT JOIN `bookings` parent ON parent.`id` = child.`bookingId` WHERE child.`bookingId` IS NOT NULL AND parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `availabilityShifts` child LEFT JOIN `users` parent ON parent.`id` = child.`createdBy` WHERE parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `availabilityShifts` child LEFT JOIN `users` parent ON parent.`id` = child.`updatedBy` WHERE child.`updatedBy` IS NOT NULL AND parent.`id` IS NULL LIMIT 1) THEN
		SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '0015 preflight: orphan in availability data';
	END IF;
	IF EXISTS (SELECT 1 FROM `timeSlots` child LEFT JOIN `gyms` parent ON parent.`id` = child.`gymId` WHERE parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `timeSlots` child LEFT JOIN `coaches` parent ON parent.`id` = child.`coachId` WHERE child.`coachId` IS NOT NULL AND parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `timeSlots` child LEFT JOIN `gymRooms` parent ON parent.`id` = child.`roomId` WHERE child.`roomId` IS NOT NULL AND parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `timeSlots` child LEFT JOIN `serviceTypes` parent ON parent.`id` = child.`serviceTypeId` WHERE child.`serviceTypeId` IS NOT NULL AND parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `bookings` child LEFT JOIN `users` parent ON parent.`id` = child.`memberUserId` WHERE parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `bookings` child LEFT JOIN `timeSlots` parent ON parent.`id` = child.`timeSlotId` WHERE parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `bookings` child LEFT JOIN `availabilityShifts` parent ON parent.`id` = child.`availabilityShiftId` WHERE child.`availabilityShiftId` IS NOT NULL AND parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `bookings` child LEFT JOIN `users` parent ON parent.`id` = child.`checkedInBy` WHERE child.`checkedInBy` IS NOT NULL AND parent.`id` IS NULL LIMIT 1) THEN
		SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '0015 preflight: orphan in booking data';
	END IF;
	IF EXISTS (SELECT 1 FROM `notifications` child LEFT JOIN `users` parent ON parent.`id` = child.`userId` WHERE parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `notifications` child LEFT JOIN `bookings` parent ON parent.`id` = child.`relatedBookingId` WHERE child.`relatedBookingId` IS NOT NULL AND parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `healthMeasurements` child LEFT JOIN `users` parent ON parent.`id` = child.`userId` WHERE parent.`id` IS NULL LIMIT 1)
		OR EXISTS (SELECT 1 FROM `healthMeasurements` child LEFT JOIN `users` parent ON parent.`id` = child.`recordedBy` WHERE parent.`id` IS NULL LIMIT 1) THEN
		SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '0015 preflight: orphan in notification or health data';
	END IF;
END;--> statement-breakpoint
CALL `coachora_preflight_0015`();--> statement-breakpoint
DROP PROCEDURE `coachora_preflight_0015`;--> statement-breakpoint
ALTER TABLE `coachClients` ADD CONSTRAINT `coach_clients_coach_client_unique` UNIQUE(`coachId`,`clientUserId`);--> statement-breakpoint
ALTER TABLE `coaches` ADD CONSTRAINT `coaches_user_unique` UNIQUE(`userId`);--> statement-breakpoint
ALTER TABLE `availabilityShifts` ADD CONSTRAINT `availability_shifts_interval_check` CHECK (`availabilityShifts`.`endAt` > `availabilityShifts`.`startAt`);--> statement-breakpoint
ALTER TABLE `availabilityShifts` ADD CONSTRAINT `availability_shifts_capacity_check` CHECK (`availabilityShifts`.`maximumCapacity` between 1 and 12);--> statement-breakpoint
ALTER TABLE `coachClients` ADD CONSTRAINT `coach_clients_primary_check` CHECK (`coachClients`.`isPrimary` in (0, 1));--> statement-breakpoint
ALTER TABLE `coachNotes` ADD CONSTRAINT `coach_notes_private_check` CHECK (`coachNotes`.`isPrivate` in (0, 1));--> statement-breakpoint
ALTER TABLE `coaches` ADD CONSTRAINT `coaches_active_check` CHECK (`coaches`.`active` in (0, 1));--> statement-breakpoint
ALTER TABLE `gymRooms` ADD CONSTRAINT `gym_rooms_capacity_check` CHECK (`gymRooms`.`maximumCapacity` between 1 and 500);--> statement-breakpoint
ALTER TABLE `gymRooms` ADD CONSTRAINT `gym_rooms_hours_check` CHECK (`gymRooms`.`openingTime` regexp '^([01][0-9]|2[0-3]):[0-5][0-9]$' and `gymRooms`.`closingTime` regexp '^([01][0-9]|2[0-3]):[0-5][0-9]$' and `gymRooms`.`openingTime` < `gymRooms`.`closingTime`);--> statement-breakpoint
ALTER TABLE `gymRooms` ADD CONSTRAINT `gym_rooms_active_check` CHECK (`gymRooms`.`active` in (0, 1));--> statement-breakpoint
ALTER TABLE `gyms` ADD CONSTRAINT `gyms_active_check` CHECK (`gyms`.`active` in (0, 1));--> statement-breakpoint
ALTER TABLE `healthMeasurements` ADD CONSTRAINT `health_measurements_value_range_check` CHECK ((`healthMeasurements`.`weight` is null or `healthMeasurements`.`weight` between 1 and 5000) and (`healthMeasurements`.`bodyFat` is null or `healthMeasurements`.`bodyFat` between 1 and 1000) and (`healthMeasurements`.`chest` is null or `healthMeasurements`.`chest` between 1 and 4000) and (`healthMeasurements`.`waist` is null or `healthMeasurements`.`waist` between 1 and 4000) and (`healthMeasurements`.`hips` is null or `healthMeasurements`.`hips` between 1 and 4000) and (`healthMeasurements`.`arms` is null or `healthMeasurements`.`arms` between 1 and 2000) and (`healthMeasurements`.`thighs` is null or `healthMeasurements`.`thighs` between 1 and 3000));--> statement-breakpoint
ALTER TABLE `healthMeasurements` ADD CONSTRAINT `health_measurements_value_required_check` CHECK (`healthMeasurements`.`weight` is not null or `healthMeasurements`.`bodyFat` is not null or `healthMeasurements`.`chest` is not null or `healthMeasurements`.`waist` is not null or `healthMeasurements`.`hips` is not null or `healthMeasurements`.`arms` is not null or `healthMeasurements`.`thighs` is not null);--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_read_check` CHECK (`notifications`.`read` in (0, 1));--> statement-breakpoint
ALTER TABLE `timeSlots` ADD CONSTRAINT `time_slots_interval_check` CHECK (`timeSlots`.`endAt` > `timeSlots`.`startAt`);--> statement-breakpoint
ALTER TABLE `timeSlots` ADD CONSTRAINT `time_slots_capacity_check` CHECK (`timeSlots`.`maximumCapacity` > 0);--> statement-breakpoint
ALTER TABLE `timeSlots` ADD CONSTRAINT `time_slots_booked_count_check` CHECK (`timeSlots`.`bookedCount` between 0 and `timeSlots`.`maximumCapacity`);--> statement-breakpoint
ALTER TABLE `auditLogs` ADD CONSTRAINT `auditLogs_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auditLogs` ADD CONSTRAINT `auditLogs_targetUserId_users_id_fk` FOREIGN KEY (`targetUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `availabilityShifts` ADD CONSTRAINT `availabilityShifts_gymId_gyms_id_fk` FOREIGN KEY (`gymId`) REFERENCES `gyms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `availabilityShifts` ADD CONSTRAINT `availabilityShifts_coachId_coaches_id_fk` FOREIGN KEY (`coachId`) REFERENCES `coaches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `availabilityShifts` ADD CONSTRAINT `availabilityShifts_roomId_gymRooms_id_fk` FOREIGN KEY (`roomId`) REFERENCES `gymRooms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `availabilityShifts` ADD CONSTRAINT `availabilityShifts_serviceTypeId_serviceTypes_id_fk` FOREIGN KEY (`serviceTypeId`) REFERENCES `serviceTypes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `availabilityShifts` ADD CONSTRAINT `availabilityShifts_memberUserId_users_id_fk` FOREIGN KEY (`memberUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `availabilityShifts` ADD CONSTRAINT `availabilityShifts_bookingId_bookings_id_fk` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `availabilityShifts` ADD CONSTRAINT `availabilityShifts_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `availabilityShifts` ADD CONSTRAINT `availabilityShifts_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_memberUserId_users_id_fk` FOREIGN KEY (`memberUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_timeSlotId_timeSlots_id_fk` FOREIGN KEY (`timeSlotId`) REFERENCES `timeSlots`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_availabilityShiftId_availabilityShifts_id_fk` FOREIGN KEY (`availabilityShiftId`) REFERENCES `availabilityShifts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_checkedInBy_users_id_fk` FOREIGN KEY (`checkedInBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coachAuthorizations` ADD CONSTRAINT `coachAuthorizations_coachId_coaches_id_fk` FOREIGN KEY (`coachId`) REFERENCES `coaches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coachClients` ADD CONSTRAINT `coachClients_coachId_coaches_id_fk` FOREIGN KEY (`coachId`) REFERENCES `coaches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coachClients` ADD CONSTRAINT `coachClients_clientUserId_users_id_fk` FOREIGN KEY (`clientUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coachClients` ADD CONSTRAINT `coachClients_assignedBy_users_id_fk` FOREIGN KEY (`assignedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coachNotes` ADD CONSTRAINT `coachNotes_coachId_coaches_id_fk` FOREIGN KEY (`coachId`) REFERENCES `coaches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coachNotes` ADD CONSTRAINT `coachNotes_clientUserId_users_id_fk` FOREIGN KEY (`clientUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coaches` ADD CONSTRAINT `coaches_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gymRooms` ADD CONSTRAINT `gymRooms_gymId_gyms_id_fk` FOREIGN KEY (`gymId`) REFERENCES `gyms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `healthMeasurements` ADD CONSTRAINT `healthMeasurements_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `healthMeasurements` ADD CONSTRAINT `healthMeasurements_recordedBy_users_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_relatedBookingId_bookings_id_fk` FOREIGN KEY (`relatedBookingId`) REFERENCES `bookings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `roomClosures` ADD CONSTRAINT `roomClosures_roomId_gymRooms_id_fk` FOREIGN KEY (`roomId`) REFERENCES `gymRooms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `roomClosures` ADD CONSTRAINT `roomClosures_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `timeSlots` ADD CONSTRAINT `timeSlots_gymId_gyms_id_fk` FOREIGN KEY (`gymId`) REFERENCES `gyms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `timeSlots` ADD CONSTRAINT `timeSlots_coachId_coaches_id_fk` FOREIGN KEY (`coachId`) REFERENCES `coaches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `timeSlots` ADD CONSTRAINT `timeSlots_roomId_gymRooms_id_fk` FOREIGN KEY (`roomId`) REFERENCES `gymRooms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `timeSlots` ADD CONSTRAINT `timeSlots_serviceTypeId_serviceTypes_id_fk` FOREIGN KEY (`serviceTypeId`) REFERENCES `serviceTypes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `auditLogs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `coach_notes_coach_client_created_idx` ON `coachNotes` (`coachId`,`clientUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `coaches_active_name_idx` ON `coaches` (`active`,`fullName`);--> statement-breakpoint
CREATE INDEX `health_measurements_user_date_idx` ON `healthMeasurements` (`userId`,`measurementDate`);--> statement-breakpoint
CREATE INDEX `notifications_user_created_idx` ON `notifications` (`userId`,`createdAt`);
