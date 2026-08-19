ALTER TABLE `gymRooms` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `roomClosures` ADD `updatedBy` int;--> statement-breakpoint
ALTER TABLE `roomClosures` ADD `updatedAt` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `roomClosures` ADD CONSTRAINT `roomClosures_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;