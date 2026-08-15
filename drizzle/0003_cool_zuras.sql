ALTER TABLE `availabilityShifts` MODIFY COLUMN `status` varchar(16) NOT NULL DEFAULT 'available';--> statement-breakpoint
UPDATE `availabilityShifts` SET `status` = LOWER(`status`);--> statement-breakpoint
ALTER TABLE `availabilityShifts` MODIFY COLUMN `status` enum('available','booked','blocked','completed','cancelled','expired') NOT NULL DEFAULT 'available';--> statement-breakpoint
ALTER TABLE `bookings` MODIFY COLUMN `status` varchar(16) NOT NULL DEFAULT 'pending';--> statement-breakpoint
UPDATE `bookings` SET `status` = CASE `status` WHEN 'No-show' THEN 'no_show' ELSE LOWER(`status`) END;--> statement-breakpoint
ALTER TABLE `bookings` MODIFY COLUMN `status` enum('pending','confirmed','cancelled','completed','no_show') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` varchar(16) NOT NULL DEFAULT 'client';--> statement-breakpoint
UPDATE `users` SET `role` = 'client' WHERE `role` = 'user';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('client','coach','admin') NOT NULL DEFAULT 'client';
