import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, boolean, jsonb, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  isAdmin: boolean("is_admin").notNull().default(false), // Admin role for question management
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Question schema - represents a wine question
// Questions are shared app-wide (not per-user)
// Supports two types:
// - 'single': Single-choice with 4 options, correctAnswer field used
// - 'multi': Multi-select with 6 options, correctAnswers array field used
export const questions = pgTable("questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  question: text("question").notNull(),
  questionType: text("question_type").notNull().default('single'), // 'single' or 'multi'
  options: text("options").array().notNull(), // Array of 4 (single) or 6 (multi) answer options
  correctAnswer: integer("correct_answer"), // For single-choice: Index of correct answer (0-3)
  correctAnswers: integer("correct_answers").array(), // For multi-select: Array of correct answer indices (0-5)
  category: text("category"), // Optional category (e.g., "Bordeaux", "Italian Wines")
});

// Review card schema - tracks SM-2 spaced repetition data per user per question
export const reviewCards = pgTable("review_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Links to user - progress is per-user
  questionId: varchar("question_id").notNull(), // Links to question
  easeFactor: real("ease_factor").notNull().default(2.5), // SM-2 ease factor (default 2.5)
  interval: integer("interval").notNull().default(0), // Days until next review
  repetitions: integer("repetitions").notNull().default(0), // Number of successful reviews
  nextReviewDate: timestamp("next_review_date").notNull().defaultNow(),
  lastReviewDate: timestamp("last_review_date"),
}, (table) => ({
  // Unique constraint: each user can have only one review card per question
  userQuestionUnique: unique("user_question_unique").on(table.userId, table.questionId),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  reviewCards: many(reviewCards),
}));

export const questionsRelations = relations(questions, ({ many }) => ({
  reviewCards: many(reviewCards),
}));

export const reviewCardsRelations = relations(reviewCards, ({ one }) => ({
  user: one(users, {
    fields: [reviewCards.userId],
    references: [users.id],
  }),
  question: one(questions, {
    fields: [reviewCards.questionId],
    references: [questions.id],
  }),
}));

// User schemas
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Question schemas
export const insertQuestionSchema = createInsertSchema(questions).omit({
  id: true,
}).refine(
  (data) => {
    if (data.questionType === 'single') {
      return (
        data.options.length === 4 &&
        typeof data.correctAnswer === 'number' &&
        data.correctAnswer >= 0 &&
        data.correctAnswer <= 3
      );
    } else if (data.questionType === 'multi') {
      return (
        data.options.length === 6 &&
        Array.isArray(data.correctAnswers) &&
        data.correctAnswers.every((ans: number) => ans >= 0 && ans <= 5)
      );
    }
    return false;
  },
  {
    message: "Single-choice questions must have 4 options and correctAnswer (0-3). Multi-select questions must have 6 options and correctAnswers array (0-5)."
  }
);

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
// Supports both single-choice and multi-select questions
const singleChoiceQuestionSchema = z.object({
  question: z.string().min(1, "Question cannot be empty"),
  type: z.literal('single').optional().default('single'),
  options: z.array(z.string()).length(4, "Single-choice questions must have exactly 4 options"),
  correctAnswer: z.number().min(0).max(3, "Correct answer must be between 0 and 3"),
  category: z.string().optional(),
});

const multiSelectQuestionSchema = z.object({
  question: z.string().min(1, "Question cannot be empty"),
  type: z.literal('multi'),
  options: z.array(z.string()).length(6, "Multi-select questions must have exactly 6 options"),
  correctAnswers: z.array(z.number().min(0).max(5)).min(0).max(6, "Multi-select can have 0-6 correct answers"),
  category: z.string().optional(),
});

export const jsonUploadSchema = z.object({
  questions: z.array(
    z.discriminatedUnion('type', [
      singleChoiceQuestionSchema,
      multiSelectQuestionSchema
    ])
  ).min(1, "Must have at least 1 question"),
});

export type JsonUpload = z.infer<typeof jsonUploadSchema>;

// Answer submission schema
// For single-choice: selectedAnswer is used
// For multi-select: selectedAnswers array is used
export const answerSubmissionSchema = z.object({
  questionId: z.string(),
  selectedAnswer: z.number().min(0).max(3).optional(), // For single-choice
  selectedAnswers: z.array(z.number().min(0).max(5)).optional(), // For multi-select
  timeTaken: z.number().optional(), // Optional: time taken to answer in seconds
}).refine(
  (data) => {
    // Must have either selectedAnswer or selectedAnswers, but not both
    return (data.selectedAnswer !== undefined) !== (data.selectedAnswers !== undefined);
  },
  {
    message: "Must provide either selectedAnswer (single-choice) or selectedAnswers (multi-select), but not both"
  }
);

export type AnswerSubmission = z.infer<typeof answerSubmissionSchema>;

// Quiz session response - what gets sent to the frontend for a quiz question
export const quizQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  questionType: z.enum(['single', 'multi']),
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
