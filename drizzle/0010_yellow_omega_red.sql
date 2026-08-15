CREATE TABLE `gymRooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`externalId` varchar(64) NOT NULL,
	`gymId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`nameNormalized` varchar(128) NOT NULL,
	`address` text NOT NULL,
	`description` text NOT NULL,
	`maximumCapacity` int NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gymRooms_id` PRIMARY KEY(`id`),
	CONSTRAINT `gymRooms_externalId_unique` UNIQUE(`externalId`),
	CONSTRAINT `gym_rooms_gym_name_unique` UNIQUE(`gymId`,`nameNormalized`)
);
--> statement-breakpoint
ALTER TABLE `availabilityShifts` ADD `roomId` int;--> statement-breakpoint
ALTER TABLE `timeSlots` ADD `roomId` int;--> statement-breakpoint
CREATE INDEX `gym_rooms_gym_active_idx` ON `gymRooms` (`gymId`,`active`);--> statement-breakpoint
CREATE INDEX `availability_shifts_room_start_idx` ON `availabilityShifts` (`roomId`,`startAt`);