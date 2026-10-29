CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`question` text NOT NULL,
	`question_type` text DEFAULT 'single' NOT NULL,
	`options` text,
	`correct_answer` integer,
	`correct_answers` text,
	`region_polygon` text,
	`region_name` text,
	`category` text,
	`curriculum` text
);
--> statement-breakpoint
CREATE TABLE `review_cards` (
	`user_id` text NOT NULL,
	`question_id` text NOT NULL,
	`ease_factor` real NOT NULL,
	`interval` integer NOT NULL,
	`repetitions` integer NOT NULL,
	`next_review_date` integer NOT NULL,
	`last_review_date` integer NOT NULL,
	PRIMARY KEY(`user_id`, `question_id`)
);
--> statement-breakpoint
CREATE INDEX `review_cards_question_idx` ON `review_cards` (`question_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`password_hash` text NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`selected_curricula` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);