CREATE TABLE `coachAuthorizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`coachId` int NOT NULL,
	`normalizedEmail` varchar(320) NOT NULL,
	`status` enum('authorized','revoked','disabled') NOT NULL DEFAULT 'authorized',
	`authorizedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `coachAuthorizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `coachAuthorizations_coachId_unique` UNIQUE(`coachId`),
	CONSTRAINT `coachAuthorizations_normalizedEmail_unique` UNIQUE(`normalizedEmail`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `emailNormalized` varchar(320);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_normalized_unique` UNIQUE(`emailNormalized`);