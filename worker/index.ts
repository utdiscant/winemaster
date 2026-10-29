import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  answerSubmissionSchema,
  jsonUploadSchema,
  loginSchema,
  questionUpdateSchema,
  questions,
  signupSchema,
  users,
  type GivenAnswer,
  type InsertQuestion,
  type QuizQuestion,
  type UserRow,
} from "@shared/schema";
import { isPointInPolygon } from "@shared/geo";
import { calculateSM2, correctnessToQuality } from "./sm2";
import {
  endSession,
  hashPassword,
  isAdminEmail,
  loadUser,
  publicUser,
  requireAdmin,
  requireUser,
  startSession,
  verifyPassword,
} from "./auth";
import {
  countCompletedToday,
  deleteAllQuestions,
  deleteQuestion,
  deleteUser,
  getAllCurricula,
  getCategorySummaries,
  getDueQuestions,
  getMistakes,
  getProgressCards,
  getQuestionWithCard,
  getStatistics,
  logAnswer,
  NEW_CARD,
  saveReviewCard,
  setKnown,
  upsertQuestions,
} from "./db";

const BASE_PATH = "/wset-training";
const DAILY_GOAL = 20;

export type Db = DrizzleD1Database & { $client: D1Database };
export type AppEnv = {
  Bindings: Env;
  Variables: { db: Db; user: UserRow | null };
};
// For handlers behind requireUser or requireAdmin, where there is always a user
export type UserEnv = AppEnv & { Variables: { user: UserRow } };

const api = new Hono<AppEnv>().basePath(`${BASE_PATH}/api`);

api.use(async (c, next) => {
  c.set("db", drizzle(c.env.DB));
  await next();
});
api.use(loadUser);

api.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
  if (error instanceof SyntaxError) return c.json({ error: "Request body is not valid JSON" }, 400);
  if (error instanceof z.ZodError) {
    return c.json({
      error: "Validation failed",
      details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message, code: issue.code })),
    }, 400);
  }
  console.error(error);
  return c.json({ error: "Something went wrong" }, 500);
});

api.notFound((c) => c.json({ error: "Not found" }, 404));

// ===== Auth =====

api.post("/auth/signup", async (c) => {
  const parsed = signupSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
  const { password, firstName, lastName } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  const db = c.var.db;
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) return c.json({ error: "Email already registered" }, 400);

  const [user] = await db.insert(users).values({
    id: crypto.randomUUID(),
    email,
    firstName: firstName || null,
    lastName: lastName || null,
    passwordHash: await hashPassword(password),
    isAdmin: isAdminEmail(c.env, email),
    createdAt: new Date(),
  }).returning();

  await startSession(c, user.id);
  return c.json(publicUser(user));
});

api.post("/auth/login", async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
  const email = parsed.data.email.toLowerCase();

  const db = c.var.db;
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return c.json({ error: "Invalid email or password" }, 401);
  }
  if (!user.isAdmin && isAdminEmail(c.env, email)) {
    [user] = await db.update(users).set({ isAdmin: true }).where(eq(users.id, user.id)).returning();
  }

  await startSession(c, user.id);
  return c.json(publicUser(user));
});

api.post("/auth/logout", async (c) => {
  await endSession(c);
  return c.json({ success: true });
});

// The logged-in user, or null
api.get("/auth/user", (c) => c.json(c.var.user ? publicUser(c.var.user) : null));

// ===== User settings =====


api.patch("/user/curricula", requireUser, async (c) => {
  const { curricula } = z.object({ curricula: z.array(z.string()).max(20, "Maximum 20 curricula allowed") })
    .parse(await c.req.json());
  const [updated] = await c.var.db
    .update(users)
    .set({ selectedCurricula: curricula })
    .where(eq(users.id, c.var.user.id))
    .returning();
  return c.json(publicUser(updated));
});

api.get("/curricula", requireUser, async (c) => c.json(await getAllCurricula(c.var.db)));

// ===== Quiz =====

const curriculaParam = (value?: string) => value?.split(",").map((s) => s.trim()).filter(Boolean);

// Questions due for review (optionally one category only), in random order, plus how far the user is
// towards today's goal
api.get("/quiz/due", requireUser, async (c) => {
  const curricula = curriculaParam(c.req.query("curricula"));
  const category = c.req.query("category") || undefined;
  const db = c.var.db;
  const userId = c.var.user.id;
  const [due, completedToday] = await Promise.all([
    getDueQuestions(db, userId, curricula, category),
    countCompletedToday(db, userId, curricula),
  ]);

  // Fisher-Yates shuffle
  for (let i = due.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [due[i], due[j]] = [due[j], due[i]];
  }

  const quizQuestions: QuizQuestion[] = due.map((q) => ({
    id: q.id,
    question: q.question,
    questionType: q.questionType,
    options: q.options ?? [],
    category: q.category ?? undefined,
    curricula: q.curricula ?? undefined,
    regionPolygon: q.regionPolygon ?? undefined,
    regionName: q.regionName ?? undefined,
  }));

  return c.json({
    questions: quizQuestions,
    dailyProgress: { completedToday, dailyGoal: DAILY_GOAL, totalDue: quizQuestions.length },
  });
});

// The categories the user can train on, with how many questions are due in each
api.get("/quiz/categories", requireUser, async (c) =>
  c.json(await getCategorySummaries(c.var.db, c.var.user.id, curriculaParam(c.req.query("curricula")))));

// Mark a question as known (it won't come up for review again) or put it back into review
api.put("/quiz/known/:questionId", requireUser, async (c) => {
  const { known } = z.object({ known: z.boolean() }).parse(await c.req.json());
  const questionId = c.req.param("questionId");
  const [question] = await c.var.db.select({ id: questions.id }).from(questions).where(eq(questions.id, questionId));
  if (!question) return c.json({ error: "Question not found" }, 404);
  await setKnown(c.var.db, c.var.user.id, questionId, known);
  return c.json({ success: true, known });
});

const matchesAcceptedAnswer = (answer: string | undefined, accepted: string[] | null) => {
  const normalized = (answer ?? "").trim().toLowerCase();
  return (accepted ?? []).some((a) => a.trim().toLowerCase() === normalized);
};

// Check an answer (or "I don't know"), log it, and schedule the question's next review with SM-2
api.post("/quiz/answer", requireUser, async (c) => {
  const { questionId, selectedAnswer, selectedAnswers, textAnswer, mapClick, displayMode, dontKnow } =
    answerSubmissionSchema.parse(await c.req.json());
  const db = c.var.db;
  const userId = c.var.user.id;

  const row = await getQuestionWithCard(db, userId, questionId);
  if (!row) return c.json({ error: "Question not found" }, 404);
  const { question, card } = row;

  let isCorrect: boolean;
  let correctAnswer: unknown;
  switch (question.questionType) {
    case "text-input":
      isCorrect = matchesAcceptedAnswer(textAnswer, question.options);
      correctAnswer = question.options ?? [];
      break;
    case "map":
      isCorrect = displayMode === "text-to-map"
        ? !!mapClick && isPointInPolygon(mapClick, question.regionPolygon)
        : displayMode === "map-to-text" && matchesAcceptedAnswer(textAnswer, question.options);
      correctAnswer = { regionName: question.regionName ?? undefined, regionPolygon: question.regionPolygon };
      break;
    case "multi": {
      const selected = new Set(selectedAnswers ?? []);
      const correct = new Set(question.correctAnswers ?? []);
      isCorrect = selected.size === correct.size && [...selected].every((a) => correct.has(a));
      correctAnswer = question.correctAnswers ?? [];
      break;
    }
    default:
      isCorrect = selectedAnswer === question.correctAnswer;
      correctAnswer = question.correctAnswer ?? 0;
  }
  if (dontKnow) isCorrect = false;

  // What the user answered, in words, for reviewing mistakes later
  const options = question.options ?? [];
  const given: GivenAnswer | null = dontKnow ? null
    : selectedAnswer !== undefined ? { options: [options[selectedAnswer]] }
    : selectedAnswers !== undefined ? { options: selectedAnswers.map((i) => options[i]) }
    : mapClick ? { mapClick }
    : { text: textAnswer };

  const previous = card ?? NEW_CARD;
  const sm2 = calculateSM2(
    // "I don't know" is SM-2's "complete blackout"
    dontKnow ? 0 : correctnessToQuality(isCorrect),
    previous.easeFactor,
    previous.interval,
    previous.repetitions,
  );
  await saveReviewCard(db, {
    userId,
    questionId,
    easeFactor: sm2.easeFactor,
    interval: sm2.interval,
    repetitions: sm2.repetitions,
    nextReviewDate: sm2.nextReviewDate,
    lastReviewDate: new Date(),
  });
  await logAnswer(db, {
    userId,
    questionId,
    outcome: dontKnow ? "dont_know" : isCorrect ? "correct" : "wrong",
    answer: given,
  });

  return c.json({
    correct: isCorrect,
    correctAnswer,
    explanation: question.explanation,
    questionType: question.questionType,
    nextReviewDate: sm2.nextReviewDate,
    interval: sm2.interval,
  });
});

// ===== Progress (filtered to the user's chosen curricula) =====

api.get("/statistics", requireUser, async (c) =>
  c.json(await getStatistics(c.var.db, c.var.user.id, c.var.user.selectedCurricula ?? undefined)));

api.get("/progress/cards", requireUser, async (c) =>
  c.json(await getProgressCards(c.var.db, c.var.user.id, c.var.user.selectedCurricula ?? undefined)));

// Questions answered wrong or "I don't know" in the last `days` days (default 7)
api.get("/mistakes", requireUser, async (c) => {
  const days = z.coerce.number().int().min(1).max(365).catch(7).parse(c.req.query("days") ?? 7);
  return c.json(await getMistakes(c.var.db, c.var.user.id, new Date(Date.now() - days * 24 * 60 * 60 * 1000)));
});

// ===== Admin =====


api.get("/users", requireAdmin, async (c) => {
  const rows = await c.var.db.select().from(users).orderBy(users.createdAt);
  return c.json(rows.map(publicUser));
});

api.delete("/users/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  if (id === c.var.user.id) return c.json({ error: "You cannot delete your own account" }, 400);
  if (!(await deleteUser(c.var.db, id))) return c.json({ error: "User not found" }, 404);
  return c.json({ success: true, message: "User deleted successfully" });
});

// Upload questions from JSON. Questions with an existing id are updated, the rest are created.
api.post("/questions/upload", requireAdmin, async (c) => {
  const { questions: uploaded } = jsonUploadSchema.parse(await c.req.json());
  const rows: InsertQuestion[] = uploaded.map((q) => {
    const curricula = q.curricula ?? (q.curriculum ? [q.curriculum] : undefined);
    const common = {
      id: q.id ?? crypto.randomUUID(),
      question: q.question,
      category: q.category,
      curricula,
      explanation: q.explanation,
      active: q.active,
    };
    switch (q.type) {
      case "multi":
        return { ...common, questionType: "multi", options: q.options, correctAnswers: q.correctAnswers };
      case "text-input":
        return { ...common, questionType: "text-input", options: q.acceptedAnswers };
      case "map":
        return {
          ...common,
          questionType: "map",
          options: q.acceptedAnswers,
          regionName: q.regionName,
          regionPolygon: q.regionPolygon,
        };
      default:
        return { ...common, questionType: "single", options: q.options, correctAnswer: q.correctAnswer };
    }
  });

  const { created, updated, progressReset } = await upsertQuestions(c.var.db, rows);
  return c.json({ success: true, created, updated, progressReset, total: created + updated });
});

api.get("/questions", requireAdmin, async (c) => c.json(await c.var.db.select().from(questions)));

api.patch("/questions/:id", requireAdmin, async (c) => {
  const updates = questionUpdateSchema.parse(await c.req.json());
  if (Object.keys(updates).length === 0) return c.json({ error: "Nothing to update" }, 400);
  const [question] = await c.var.db
    .update(questions)
    .set(updates)
    .where(eq(questions.id, c.req.param("id")))
    .returning();
  if (!question) return c.json({ error: "Question not found" }, 404);
  return c.json(question);
});

api.delete("/questions/:id", requireAdmin, async (c) => {
  if (!(await deleteQuestion(c.var.db, c.req.param("id")))) return c.json({ error: "Question not found" }, 404);
  return c.json({ success: true });
});

api.delete("/questions", requireAdmin, async (c) => c.json({ success: true, count: await deleteAllQuestions(c.var.db) }));

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith(`${BASE_PATH}/api/`)) return api.fetch(request, env, ctx);

    // Any other path that isn't a file is a page of the app: serve the app shell
    return env.ASSETS.fetch(new URL(`${BASE_PATH}/`, url));
  },
} satisfies ExportedHandler<Env>;
