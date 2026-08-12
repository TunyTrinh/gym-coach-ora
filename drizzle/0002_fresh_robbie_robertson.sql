CREATE TABLE `availabilityShifts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `externalId` varchar(64) NOT NULL,
  `gymId` int NOT NULL,
  `coachId` int NOT NULL,
  `serviceTypeId` int NOT NULL,
  `startAt` timestamp NOT NULL,
  `endAt` timestamp NOT NULL,
  `location` varchar(128) NOT NULL,
  `note` text,
  `status` enum('Available','Booked','Blocked','Completed','Cancelled','Expired') NOT NULL DEFAULT 'Available',
  `memberUserId` int,
  `bookingId` int,
  `createdBy` int NOT NULL,
  `updatedBy` int,
  `recurrenceGroupId` varchar(64),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `availabilityShifts_id` PRIMARY KEY(`id`),
  CONSTRAINT `availabilityShifts_externalId_unique` UNIQUE(`externalId`)
);
--> statement-breakpoint
ALTER TABLE `bookings` ADD `availabilityShiftId` int;
--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_availability_shift_unique` UNIQUE(`availabilityShiftId`);
--> statement-breakpoint
CREATE INDEX `availability_shifts_coach_start_idx` ON `availabilityShifts` (`coachId`,`startAt`);
--> statement-breakpoint
CREATE INDEX `availability_shifts_status_start_idx` ON `availabilityShifts` (`status`,`startAt`);
