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
  selectedCurricula: text("selected_curricula").array(), // User's selected curricula for quiz filtering
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Question schema - represents a wine question
// Questions are shared app-wide (not per-user)
// Supports three types:
// - 'single': Single-choice with 4 options, correctAnswer field used
// - 'multi': Multi-select with 6 options, correctAnswers array field used
// - 'map': Map-based region identification, uses map-specific fields
export const questions = pgTable("questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  question: text("question").notNull(),
  questionType: text("question_type").notNull().default('single'), // 'single', 'multi', or 'map'
  options: text("options").array(), // Array of 4 (single) or 6 (multi) answer options, empty for map
  correctAnswer: integer("correct_answer"), // For single-choice: Index of correct answer (0-3)
  correctAnswers: integer("correct_answers").array(), // For multi-select: Array of correct answer indices (0-5)
  category: text("category"), // Optional category (e.g., "Bordeaux", "Italian Wines")
  curriculum: text("curriculum"), // Optional curriculum (e.g., "WSET1", "WSET2", "WSET3")
  
  // Map question fields
  mapRegionName: text("map_region_name"), // Correct answer for map questions (e.g., "Mosel")
  mapCountry: text("map_country"), // Country context (e.g., "Germany")
  mapLatitude: real("map_latitude"), // Latitude for map centering
  mapLongitude: real("map_longitude"), // Longitude for map centering
  mapZoom: real("map_zoom"), // Zoom level for map display
  mapVariant: text("map_variant"), // 'location-to-name' or 'name-to-location'
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
// ID is optional: if provided, used for upsert (update if exists, insert if new)
// If not provided, auto-generated UUID is used
export const insertQuestionSchema = createInsertSchema(questions).extend({
  id: z.string().optional(),
}).refine(
  (data) => {
    if (data.questionType === 'single') {
      return (
        data.options &&
        data.options.length === 4 &&
        typeof data.correctAnswer === 'number' &&
        data.correctAnswer >= 0 &&
        data.correctAnswer <= 3
      );
    } else if (data.questionType === 'multi') {
      return (
        data.options &&
        data.options.length === 6 &&
        Array.isArray(data.correctAnswers) &&
        data.correctAnswers.every((ans: number) => ans >= 0 && ans <= 5)
      );
    } else if (data.questionType === 'map') {
      return (
        typeof data.mapRegionName === 'string' &&
        data.mapRegionName.length > 0 &&
        typeof data.mapLatitude === 'number' &&
        typeof data.mapLongitude === 'number' &&
        typeof data.mapZoom === 'number' &&
        (data.mapVariant === 'location-to-name' || data.mapVariant === 'name-to-location')
      );
    }
    return false;
  },
  {
    message: "Single-choice questions must have 4 options and correctAnswer (0-3). Multi-select questions must have 6 options and correctAnswers array (0-5). Map questions must have mapRegionName, mapLatitude, mapLongitude, mapZoom, and mapVariant."
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
// Supports single-choice, multi-select, and map questions
// ID is optional: if provided, updates existing question (and clears all user progress)
// If not provided, creates new question with auto-generated ID
const singleChoiceQuestionSchema = z.object({
  id: z.string().optional(),
  question: z.string().min(1, "Question cannot be empty"),
  type: z.literal('single').optional().default('single'),
  options: z.array(z.string()).length(4, "Single-choice questions must have exactly 4 options"),
  correctAnswer: z.number().min(0).max(3, "Correct answer must be between 0 and 3"),
  category: z.string().optional(),
  curriculum: z.string().optional(),
});

const multiSelectQuestionSchema = z.object({
  id: z.string().optional(),
  question: z.string().min(1, "Question cannot be empty"),
  type: z.literal('multi'),
  options: z.array(z.string()).length(6, "Multi-select questions must have exactly 6 options"),
  correctAnswers: z.array(z.number().min(0).max(5)).min(0).max(6, "Multi-select can have 0-6 correct answers"),
  category: z.string().optional(),
  curriculum: z.string().optional(),
});

const mapQuestionSchema = z.object({
  id: z.string().optional(),
  question: z.string().min(1, "Question cannot be empty"),
  type: z.literal('map'),
  regionName: z.string().min(1, "Region name cannot be empty"),
  country: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
  zoom: z.number(),
  variant: z.enum(['location-to-name', 'name-to-location']),
  category: z.string().optional(),
  curriculum: z.string().optional(),
});

export const jsonUploadSchema = z.object({
  questions: z.array(
    z.discriminatedUnion('type', [
      singleChoiceQuestionSchema,
      multiSelectQuestionSchema,
      mapQuestionSchema
    ])
  ).min(1, "Must have at least 1 question"),
});

export type JsonUpload = z.infer<typeof jsonUploadSchema>;

// Answer submission schema
// For single-choice: selectedAnswer is used
// For multi-select: selectedAnswers array is used
// For map: textAnswer is used
export const answerSubmissionSchema = z.object({
  questionId: z.string(),
  selectedAnswer: z.number().min(0).max(3).optional(), // For single-choice
  selectedAnswers: z.array(z.number().min(0).max(5)).optional(), // For multi-select
  textAnswer: z.string().optional(), // For map questions
  timeTaken: z.number().optional(), // Optional: time taken to answer in seconds
}).refine(
  (data) => {
    // Must have exactly one of: selectedAnswer, selectedAnswers, or textAnswer
    const hasSelectedAnswer = data.selectedAnswer !== undefined;
    const hasSelectedAnswers = data.selectedAnswers !== undefined;
    const hasTextAnswer = data.textAnswer !== undefined;
    const count = [hasSelectedAnswer, hasSelectedAnswers, hasTextAnswer].filter(Boolean).length;
    return count === 1;
  },
  {
    message: "Must provide exactly one of: selectedAnswer (single-choice), selectedAnswers (multi-select), or textAnswer (map)"
  }
);

export type AnswerSubmission = z.infer<typeof answerSubmissionSchema>;

// Quiz session response - what gets sent to the frontend for a quiz question
export const quizQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  questionType: z.enum(['single', 'multi', 'map']),
  options: z.array(z.string()).optional(),
  category: z.string().optional(),
  curriculum: z.string().optional(),
  reviewCardId: z.string(),
  
  // Map question fields
  mapRegionName: z.string().optional(),
  mapCountry: z.string().optional(),
  mapLatitude: z.number().optional(),
  mapLongitude: z.number().optional(),
  mapZoom: z.number().optional(),
  mapVariant: z.string().optional(),
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
