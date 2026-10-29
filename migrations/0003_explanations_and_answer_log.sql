CREATE TABLE `answer_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`question_id` text NOT NULL,
	`answered_at` integer NOT NULL,
	`outcome` text NOT NULL,
	`answer` text
);
--> statement-breakpoint
CREATE INDEX `answer_log_user_time_idx` ON `answer_log` (`user_id`,`answered_at`);--> statement-breakpoint
CREATE INDEX `answer_log_question_idx` ON `answer_log` (`question_id`);--> statement-breakpoint
ALTER TABLE `questions` ADD `explanation` text;