CREATE TABLE `exam_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`taken_at` integer NOT NULL,
	`total` integer NOT NULL,
	`correct_count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `exam_attempts_user_idx` ON `exam_attempts` (`user_id`);--> statement-breakpoint
CREATE TABLE `exam_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`lo` integer NOT NULL,
	`category` text NOT NULL,
	`question` text NOT NULL,
	`options` text NOT NULL,
	`correct` integer NOT NULL,
	`explanation` text,
	`videos` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`section` text NOT NULL,
	`duration` text,
	`course_order` integer NOT NULL
);
