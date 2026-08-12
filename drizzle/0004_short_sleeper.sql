ALTER TABLE `coaches` ADD `gymId` int NOT NULL;
ALTER TABLE `coaches` ADD `gymId` int;
--> statement-breakpoint
UPDATE `coaches` AS `coach`
LEFT JOIN (
  SELECT `coachId`, MIN(`gymId`) AS `gymId`
  FROM `timeSlots`
  WHERE `coachId` IS NOT NULL
  GROUP BY `coachId`
) AS `slotGym` ON `slotGym`.`coachId` = `coach`.`id`
JOIN (SELECT MIN(`id`) AS `gymId` FROM `gyms`) AS `defaultGym`
SET `coach`.`gymId` = COALESCE(`slotGym`.`gymId`, `defaultGym`.`gymId`)
WHERE `coach`.`gymId` IS NULL;
--> statement-breakpoint
ALTER TABLE `coaches` MODIFY `gymId` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `coaches` ADD CONSTRAINT `coaches_gymId_gyms_id_fk` FOREIGN KEY (`gymId`) REFERENCES `gyms`(`id`) ON DELETE no action ON UPDATE no action;
