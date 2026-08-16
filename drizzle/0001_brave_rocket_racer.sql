CREATE TABLE `bookings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`externalId` varchar(64) NOT NULL,
	`memberUserId` int NOT NULL,
	`timeSlotId` int NOT NULL,
	`status` enum('Pending','Confirmed','Cancelled','Completed','No-show') NOT NULL DEFAULT 'Pending',
	`bookingTime` timestamp NOT NULL DEFAULT (now()),
	`cancellationTime` timestamp,
	`cancellationReason` text,
	`checkInTime` timestamp,
	`checkedInBy` int,
	`memberNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bookings_id` PRIMARY KEY(`id`),
	CONSTRAINT `bookings_externalId_unique` UNIQUE(`externalId`)
);
--> statement-breakpoint
CREATE TABLE `coaches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`externalId` varchar(64) NOT NULL,
	`userId` int,
	`fullName` varchar(255) NOT NULL,
	`specialty` varchar(255) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `coaches_id` PRIMARY KEY(`id`),
	CONSTRAINT `coaches_externalId_unique` UNIQUE(`externalId`)
);
--> statement-breakpoint
CREATE TABLE `gyms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`externalId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`address` text NOT NULL,
	`phone` varchar(32),
	`timezone` varchar(64) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gyms_id` PRIMARY KEY(`id`),
	CONSTRAINT `gyms_externalId_unique` UNIQUE(`externalId`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('confirmation','reminder','announcement','cancellation','membership') NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`read` boolean NOT NULL DEFAULT false,
	`relatedBookingId` int,
	`priority` enum('Normal','Important','Urgent') NOT NULL DEFAULT 'Normal',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `serviceTypes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`externalId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`durationMinutes` int NOT NULL,
	`defaultCapacity` int NOT NULL,
	`coachRequired` boolean NOT NULL DEFAULT false,
	`cancellationWindowMinutes` int NOT NULL,
	`priceCents` int,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `serviceTypes_id` PRIMARY KEY(`id`),
	CONSTRAINT `serviceTypes_externalId_unique` UNIQUE(`externalId`)
);
--> statement-breakpoint
CREATE TABLE `timeSlots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`externalId` varchar(64) NOT NULL,
	`gymId` int NOT NULL,
	`coachId` int,
	`serviceTypeId` int NOT NULL,
	`startAt` timestamp NOT NULL,
	`endAt` timestamp NOT NULL,
	`maximumCapacity` int NOT NULL,
	`bookedCount` int NOT NULL DEFAULT 0,
	`status` enum('Open','Full','Blocked','Cancelled','Completed') NOT NULL DEFAULT 'Open',
	`room` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `timeSlots_id` PRIMARY KEY(`id`),
	CONSTRAINT `timeSlots_externalId_unique` UNIQUE(`externalId`)
);
