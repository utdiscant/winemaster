import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Question schema - represents a single wine question with 4 answer options
export const questions = pgTable("questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  question: text("question").notNull(),
  options: text("options").array().notNull(), // Array of 4 answer options
  correctAnswer: integer("correct_answer").notNull(), // Index of correct answer (0-3)
  category: text("category"), // Optional category (e.g., "Bordeaux", "Italian Wines")
});

// Review card schema - tracks SM-2 spaced repetition data for each question
export const reviewCards = pgTable("review_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  questionId: varchar("question_id").notNull(),
  easeFactor: real("ease_factor").notNull().default(2.5), // SM-2 ease factor (default 2.5)
  interval: integer("interval").notNull().default(0), // Days until next review
  repetitions: integer("repetitions").notNull().default(0), // Number of successful reviews
  nextReviewDate: timestamp("next_review_date").notNull().defaultNow(),
  lastReviewDate: timestamp("last_review_date"),
});

// Question schemas
export const insertQuestionSchema = createInsertSchema(questions).omit({
  id: true,
});

export const questionSchema = createInsertSchema(questions);

export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Question = typeof questions.$inferSelect;

// Review card schemas
export const insertReviewCardSchema = createInsertSchema(reviewCards).omit({
  id: true,
  easeFactor: true,
  interval: true,
  repetitions: true,
  nextReviewDate: true,
});

export type InsertReviewCard = z.infer<typeof insertReviewCardSchema>;
export type ReviewCard = typeof reviewCards.$inferSelect;

// JSON upload schema - validates the uploaded JSON file structure
export const jsonUploadSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string().min(1, "Question cannot be empty"),
      options: z.array(z.string()).length(4, "Each question must have exactly 4 options"),
      correctAnswer: z.number().min(0).max(3, "Correct answer must be between 0 and 3"),
      category: z.string().optional(),
    })
  ).min(1, "Must have at least 1 question"),
});

export type JsonUpload = z.infer<typeof jsonUploadSchema>;

// Answer submission schema
export const answerSubmissionSchema = z.object({
  questionId: z.string(),
  selectedAnswer: z.number().min(0).max(3),
  timeTaken: z.number().optional(), // Optional: time taken to answer in seconds
});

export type AnswerSubmission = z.infer<typeof answerSubmissionSchema>;

// Quiz session response - what gets sent to the frontend for a quiz question
export const quizQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.string()),
  category: z.string().optional(),
  reviewCardId: z.string(),
});

export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

// Statistics response
export const statisticsSchema = z.object({
  totalQuestions: z.number(),
  masteredQuestions: z.number(),
  learningQuestions: z.number(),
  newQuestions: z.number(),
  dueToday: z.number(),
  dueThisWeek: z.number(),
  averageEaseFactor: z.number(),
  totalReviews: z.number(),
});

export type Statistics = z.infer<typeof statisticsSchema>;
