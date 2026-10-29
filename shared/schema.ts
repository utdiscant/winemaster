import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";
import { z } from "zod";

// ===== Tables (Cloudflare D1 / SQLite) =====

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(), // Stored lowercase
  firstName: text("first_name"),
  lastName: text("last_name"),
  passwordHash: text("password_hash").notNull(),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  selectedCurricula: text("selected_curricula", { mode: "json" }).$type<string[]>(), // Curricula the quiz is filtered to
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

// Login sessions. The cookie holds a random token; only its SHA-256 hash is stored here.
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("sessions_user_idx").on(table.userId)]);

// Questions are shared app-wide. Four types:
// - 'single': 4 options, correctAnswer is the index of the right one (0-3)
// - 'multi': 6 options, correctAnswers is an array of indices (0-5)
// - 'text-input': options holds the accepted answers (case-insensitive match)
// - 'map': regionPolygon (GeoJSON Polygon or MultiPolygon) and regionName; options holds the accepted
//          names. Shown either as click-the-region or name-the-region.
export const questions = sqliteTable("questions", {
  id: text("id").primaryKey(),
  question: text("question").notNull(),
  questionType: text("question_type").$type<QuestionType>().notNull().default("single"),
  options: text("options", { mode: "json" }).$type<string[]>(),
  correctAnswer: integer("correct_answer"),
  correctAnswers: text("correct_answers", { mode: "json" }).$type<number[]>(),
  regionPolygon: text("region_polygon", { mode: "json" }).$type<unknown>(),
  regionName: text("region_name"),
  category: text("category"),
  curricula: text("curricula", { mode: "json" }).$type<string[]>(), // e.g. ["WSET2", "WSET3"]
  explanation: text("explanation"), // The theory behind the answer, shown after a wrong answer or "I don't know"
  // Inactive questions are kept (with everyone's progress) but left out of quizzes and statistics
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

// SM-2 state per user per question. A question the user has never answered has no row and counts as
// new and due. A question marked as known is never due.
export const reviewCards = sqliteTable("review_cards", {
  userId: text("user_id").notNull(),
  questionId: text("question_id").notNull(),
  easeFactor: real("ease_factor").notNull(),
  interval: integer("interval").notNull(), // Days until next review
  repetitions: integer("repetitions").notNull(), // Successful reviews in a row
  nextReviewDate: integer("next_review_date", { mode: "timestamp_ms" }).notNull(),
  lastReviewDate: integer("last_review_date", { mode: "timestamp_ms" }).notNull(),
  // Set when the user says they know this question and don't need to review it again
  knownAt: integer("known_at", { mode: "timestamp_ms" }),
}, (table) => [
  primaryKey({ columns: [table.userId, table.questionId] }),
  index("review_cards_question_idx").on(table.questionId),
]);

// Every answer a user gives, so they can review their mistakes
export const answerLog = sqliteTable("answer_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  questionId: text("question_id").notNull(),
  answeredAt: integer("answered_at", { mode: "timestamp_ms" }).notNull(),
  outcome: text("outcome").$type<AnswerOutcome>().notNull(),
  answer: text("answer", { mode: "json" }).$type<GivenAnswer>(), // What the user answered; null for "I don't know"
}, (table) => [
  index("answer_log_user_time_idx").on(table.userId, table.answeredAt),
  index("answer_log_question_idx").on(table.questionId),
]);

// ===== Types =====

export type AnswerOutcome = "correct" | "wrong" | "dont_know";
// The answer as given: option texts for choice questions, typed text, or a map click
export type GivenAnswer = { options?: string[]; text?: string; mapClick?: { lat: number; lng: number } };

export type QuestionType = "single" | "multi" | "text-input" | "map";
export type Question = typeof questions.$inferSelect;
export type InsertQuestion = typeof questions.$inferInsert;
export type ReviewCard = typeof reviewCards.$inferSelect;
export type UserRow = typeof users.$inferSelect;

// What the API sends about a user: everything except the password hash
export type User = Omit<UserRow, "passwordHash">;

// JSON upload: questions without an id are created; with an id they are created or, if the id
// exists, updated. Changing what a question asks or accepts resets everyone's progress on it;
// changing only its category or curricula does not.
const singleChoiceQuestionSchema = z.object({
  id: z.string().optional(),
  question: z.string().min(1, "Question cannot be empty"),
  type: z.literal('single').optional().default('single'),
  options: z.array(z.string()).length(4, "Single-choice questions must have exactly 4 options"),
  correctAnswer: z.number().int().min(0).max(3, "Correct answer must be between 0 and 3"),
  category: z.string().optional(),
  explanation: z.string().optional(),
  active: z.boolean().optional(), // Only applies to new questions; existing ones keep their status
  curriculum: z.string().optional(), // One curriculum (older files)
  curricula: z.array(z.string()).optional(), // One or more, e.g. ["WSET2", "WSET3"]
});

const multiSelectQuestionSchema = z.object({
  id: z.string().optional(),
  question: z.string().min(1, "Question cannot be empty"),
  type: z.literal('multi'),
  options: z.array(z.string()).length(6, "Multi-select questions must have exactly 6 options"),
  correctAnswers: z.array(z.number().int().min(0).max(5)).max(6, "Multi-select can have 0-6 correct answers"),
  category: z.string().optional(),
  explanation: z.string().optional(),
  active: z.boolean().optional(), // Only applies to new questions; existing ones keep their status
  curriculum: z.string().optional(), // One curriculum (older files)
  curricula: z.array(z.string()).optional(), // One or more, e.g. ["WSET2", "WSET3"]
});

const textInputQuestionSchema = z.object({
  id: z.string().optional(),
  question: z.string().min(1, "Question cannot be empty"),
  type: z.literal('text-input'),
  acceptedAnswers: z.array(z.string()).min(1, "Text-input questions must have at least 1 accepted answer"),
  category: z.string().optional(),
  explanation: z.string().optional(),
  active: z.boolean().optional(), // Only applies to new questions; existing ones keep their status
  curriculum: z.string().optional(), // One curriculum (older files)
  curricula: z.array(z.string()).optional(), // One or more, e.g. ["WSET2", "WSET3"]
});

const mapQuestionSchema = z.object({
  id: z.string().optional(),
  question: z.string().min(1, "Question cannot be empty"),
  type: z.literal('map'),
  regionName: z.string().min(1, "Region name is required"),
  regionPolygon: z.any().refine((polygon) => polygon != null, "Region polygon is required"), // GeoJSON
  acceptedAnswers: z.array(z.string()).min(1, "Map questions must have at least 1 accepted answer"),
  category: z.string().optional(),
  explanation: z.string().optional(),
  active: z.boolean().optional(), // Only applies to new questions; existing ones keep their status
  curriculum: z.string().optional(), // One curriculum (older files)
  curricula: z.array(z.string()).optional(), // One or more, e.g. ["WSET2", "WSET3"]
});

export const jsonUploadSchema = z.object({
  questions: z.array(
    z.discriminatedUnion('type', [
      singleChoiceQuestionSchema,
      multiSelectQuestionSchema,
      textInputQuestionSchema,
      mapQuestionSchema
    ])
  ).min(1, "Must have at least 1 question"),
});

export type JsonUpload = z.infer<typeof jsonUploadSchema>;

// Admin edits to a single question
export const questionUpdateSchema = z.object({
  question: z.string().min(1),
  questionType: z.enum(["single", "multi", "text-input", "map"]),
  options: z.array(z.string()),
  correctAnswer: z.number().int().min(0).max(5).nullable(),
  correctAnswers: z.array(z.number().int().min(0).max(5)).nullable(),
  category: z.string().nullable(),
  curricula: z.array(z.string()).nullable(),
  explanation: z.string().nullable(),
  active: z.boolean(),
}).partial();

// Answer submission: exactly one of
// - selectedAnswer (single-choice)
// - selectedAnswers (multi-select)
// - textAnswer (text-input, or a map question shown as name-the-region)
// - mapClick (a map question shown as click-the-region)
// - dontKnow (the user clicked "I don't know")
export const answerSubmissionSchema = z.object({
  questionId: z.string(),
  selectedAnswer: z.number().min(0).max(3).optional(),
  selectedAnswers: z.array(z.number().min(0).max(5)).optional(),
  textAnswer: z.string().optional(),
  mapClick: z.object({ lat: z.number(), lng: z.number() }).optional(),
  displayMode: z.enum(['text-to-map', 'map-to-text']).optional(), // For map questions: which mode was shown
  dontKnow: z.literal(true).optional(),
  timeTaken: z.number().optional(),
}).refine(
  (data) => [data.selectedAnswer, data.selectedAnswers, data.textAnswer, data.mapClick, data.dontKnow]
    .filter((answer) => answer !== undefined).length === 1,
  {
    message: "Must provide exactly one of: selectedAnswer (single-choice), selectedAnswers (multi-select), textAnswer (text-input or map-to-text), mapClick (text-to-map), or dontKnow"
  }
);

export type AnswerSubmission = z.infer<typeof answerSubmissionSchema>;

// A quiz question as sent to the browser: no correct answers
export type QuizQuestion = {
  id: string;
  question: string;
  questionType: QuestionType;
  options: string[];
  regionPolygon?: unknown;
  regionName?: string;
  category?: string;
  curricula?: string[];
};

export type Statistics = {
  totalQuestions: number;
  masteredQuestions: number;
  learningQuestions: number;
  newQuestions: number;
  dueToday: number;
  dueThisWeek: number;
  completedToday: number;
  averageEaseFactor: number;
  totalReviews: number;
  knownQuestions: number; // Marked as known by the user; also counted as mastered
};

// A question with the user's progress on it, for the progress page
export type ProgressCard = {
  questionId: string;
  question: string;
  options: string[];
  correctAnswer: number | null;
  correctAnswers: number[] | null;
  questionType: QuestionType;
  category: string | null;
  curricula: string[] | null;
  repetitions: number;
  interval: number;
  nextReviewDate: string;
  easeFactor: number;
  known: boolean;
};

// A category with how many of its questions there are and how many are due
export type CategorySummary = {
  category: string;
  total: number;
  due: number;
};

// A question the user got wrong or didn't know in a period, for the Mistakes page and study guides
export type Mistake = {
  questionId: string;
  question: string;
  questionType: QuestionType;
  category: string | null;
  correctAnswers: string[]; // Option texts, accepted answers, or the region name
  explanation: string | null;
  wrongCount: number; // Wrong answers in the period
  dontKnowCount: number; // "I don't know" in the period
  lastAnswer: GivenAnswer | null; // The most recent wrong answer given
  lastMistakeAt: string;
  correctSince: boolean; // Answered correctly after the last mistake
};

// Authentication
export const signupSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
