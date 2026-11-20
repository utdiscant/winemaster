-- A question can now belong to several curricula (e.g. WSET2 and WSET3): curriculum (text) becomes
-- curricula (a JSON array)
ALTER TABLE `questions` ADD `curricula` text;--> statement-breakpoint
UPDATE `questions` SET `curricula` = json_array(`curriculum`) WHERE `curriculum` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `questions` DROP COLUMN `curriculum`;
