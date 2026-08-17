ALTER TABLE `availabilityShifts` MODIFY COLUMN `serviceTypeId` int;--> statement-breakpoint
ALTER TABLE `timeSlots` MODIFY COLUMN `serviceTypeId` int;--> statement-breakpoint
ALTER TABLE `gymRooms` ADD `openingTime` varchar(5) DEFAULT '00:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `gymRooms` ADD `closingTime` varchar(5) DEFAULT '23:59' NOT NULL;
