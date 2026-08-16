ALTER TABLE `bookings` DROP INDEX `bookings_availability_shift_unique`;--> statement-breakpoint
ALTER TABLE `availabilityShifts` ADD `maximumCapacity` int DEFAULT 1 NOT NULL;