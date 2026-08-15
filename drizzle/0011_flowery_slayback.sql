CREATE TABLE `roomClosures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`closureDate` date NOT NULL,
	`reason` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `roomClosures_id` PRIMARY KEY(`id`),
	CONSTRAINT `room_closures_room_date_unique` UNIQUE(`roomId`,`closureDate`)
);
--> statement-breakpoint
CREATE INDEX `room_closures_date_idx` ON `roomClosures` (`closureDate`);