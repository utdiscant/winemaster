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
  // Categories (chapters) the user has paused, e.g. not covered in their course yet: left out of their
  // quizzes and statistics until they turn them back on
  pausedCategories: text("paused_categories", { mode: "json" }).$type<string[]>(),
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
// - 'place': the question is the name of a smaller wine area; options holds where it is, [country,
//          bigger area], and the user answers by choosing both
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

// ===== Mock exams =====

// Questions in the style of the real WSET Level 3 exam (Part 1): four options, one correct. `lo` is the
// specification's learning outcome, which sets how many questions an exam draws from each part.
export const examQuestions = sqliteTable("exam_questions", {
  id: text("id").primaryKey(),
  lo: integer("lo").notNull(),
  category: text("category").notNull(),
  question: text("question").notNull(),
  options: text("options", { mode: "json" }).$type<string[]>().notNull(),
  correct: integer("correct").notNull(),
  explanation: text("explanation"),
  videos: text("videos", { mode: "json" }).$type<string[]>().notNull(), // Video ids, most relevant first
});

// The study videos questions point to (Wine With Jimmy's Level 3 course)
export const videos = sqliteTable("videos", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  section: text("section").notNull(),
  duration: text("duration"),
  courseOrder: integer("course_order").notNull(),
});

export const examAttempts = sqliteTable("exam_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  takenAt: integer("taken_at", { mode: "timestamp_ms" }).notNull(),
  total: integer("total").notNull(),
  correctCount: integer("correct_count").notNull(),
}, (table) => [index("exam_attempts_user_idx").on(table.userId)]);

// ===== Types =====

export type AnswerOutcome = "correct" | "wrong" | "dont_know";
// The answer as given: option texts for choice questions, typed text, or a map click
export type GivenAnswer = { options?: string[]; text?: string; mapClick?: { lat: number; lng: number } };

export type QuestionType = "single" | "multi" | "text-input" | "map" | "place";
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

const placeQuestionSchema = z.object({
  id: z.string().optional(),
  question: z.string().min(1, "Question cannot be empty"), // The place's name, e.g. "Walker Bay"
  type: z.literal('place'),
  path: z.tuple([z.string().min(1), z.string().min(1)]), // [country, bigger area]
  category: z.string().optional(),
  explanation: z.string().optional(),
  active: z.boolean().optional(),
  curriculum: z.string().optional(),
  curricula: z.array(z.string()).optional(),
});

export const jsonUploadSchema = z.object({
  questions: z.array(
    z.discriminatedUnion('type', [
      singleChoiceQuestionSchema,
      multiSelectQuestionSchema,
      textInputQuestionSchema,
      mapQuestionSchema,
      placeQuestionSchema
    ])
  ).min(1, "Must have at least 1 question"),
});

export type JsonUpload = z.infer<typeof jsonUploadSchema>;

// Admin edits to a single question
export const questionUpdateSchema = z.object({
  question: z.string().min(1),
  questionType: z.enum(["single", "multi", "text-input", "map", "place"]),
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
// - path (a place question: the chosen [country, bigger area])
// - dontKnow (the user clicked "I don't know")
export const answerSubmissionSchema = z.object({
  questionId: z.string(),
  selectedAnswer: z.number().min(0).max(3).optional(),
  selectedAnswers: z.array(z.number().min(0).max(5)).optional(),
  textAnswer: z.string().optional(),
  mapClick: z.object({ lat: z.number(), lng: z.number() }).optional(),
  displayMode: z.enum(['text-to-map', 'map-to-text']).optional(), // For map questions: which mode was shown
  path: z.array(z.string()).length(2).optional(),
  dontKnow: z.literal(true).optional(),
  timeTaken: z.number().optional(),
}).refine(
  (data) => [data.selectedAnswer, data.selectedAnswers, data.textAnswer, data.mapClick, data.path, data.dontKnow]
    .filter((answer) => answer !== undefined).length === 1,
  {
    message: "Must provide exactly one of: selectedAnswer (single-choice), selectedAnswers (multi-select), textAnswer (text-input or map-to-text), mapClick (text-to-map), path (place), or dontKnow"
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

// Where place questions can be: each country with its bigger areas, for building the answer choices
export type PlaceTree = { country: string; areas: string[] }[];

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

// Mock exams

// The real exam's 50 multiple-choice questions per learning outcome
export const EXAM_WEIGHTS: Record<number, number> = { 1: 8, 2: 28, 3: 5, 4: 5, 5: 4 };
export const EXAM_PASS_PERCENT = 55;
export const LEARNING_OUTCOMES: Record<number, string> = {
  1: "Vineyard and winery factors",
  2: "Still wines of the world",
  3: "Sparkling wines",
  4: "Fortified wines",
  5: "Storage, service and food",
};

export type ExamQuestion = typeof examQuestions.$inferSelect;
export type Video = typeof videos.$inferSelect;

// Upload: the whole bank and video list, replacing what's there
export const examBankUploadSchema = z.object({
  videos: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    url: z.string().url(),
    section: z.string(),
    duration: z.string().optional(),
    course_order: z.number().int(),
  }).passthrough()).min(1),
  questions: z.array(z.object({
    id: z.string().min(1),
    lo: z.number().int().min(1).max(5),
    category: z.string().min(1),
    question: z.string().min(1),
    options: z.array(z.string().min(1)).length(4),
    correct: z.number().int().min(0).max(3),
    explanation: z.string().optional(),
    videos: z.array(z.string()).max(5),
  })).min(1),
});

export const examStartSchema = z.object({
  count: z.number().int().min(1).max(200),
  onlyStudying: z.boolean().default(true), // Leave out the user's paused chapters
});

// A question as handed out in an exam: no answer
export type ExamPaperQuestion = { id: string; question: string; options: string[]; category: string; lo: number };

export const examSubmitSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string(),
    choice: z.number().int().min(0).max(3).nullable(), // null = left blank
  })).min(1).max(200),
});

export type ExamVideo = Pick<Video, "id" | "title" | "url" | "section" | "duration">;

export type ExamResult = {
  total: number;
  correctCount: number;
  percent: number;
  passed: boolean;
  byLearningOutcome: { lo: number; name: string; correct: number; total: number }[];
  questions: {
    id: string;
    number: number;
    question: string;
    options: string[];
    category: string;
    choice: number | null;
    correct: number;
    isCorrect: boolean;
    explanation: string | null;
    videos: ExamVideo[];
  }[];
  // Videos for the questions missed, most useful first; `questionNumbers` are the missed questions each covers
  recommendedVideos: (ExamVideo & { questionNumbers: number[] })[];
};

export type ExamAttempt = { id: number; takenAt: string; total: number; correctCount: number };

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
