import { and, eq, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import {
  questions,
  reviewCards,
  sessions,
  users,
  type InsertQuestion,
  type ProgressCard,
  type Question,
  type ReviewCard,
  type Statistics,
} from "@shared/schema";
import type { Db } from "./index";

// D1 caps a single bound value at 2 MB, so large uploads are sent in pieces
const MAX_JSON_CHUNK = 1_000_000;

// SM-2 starting values for a question the user hasn't answered yet
export const NEW_CARD = { easeFactor: 2.5, interval: 0, repetitions: 0 };

const DAY_MS = 24 * 60 * 60 * 1000;

// Questions tagged with at least one of these curricula
function curriculumFilter(curricula?: string[]): SQL | undefined {
  if (!curricula || curricula.length === 0) return undefined;
  return sql`EXISTS (SELECT 1 FROM json_each(${questions.curricula}) WHERE value IN (SELECT value FROM json_each(${JSON.stringify(curricula)})))`;
}

// Every question (optionally only some curricula) with this user's review card, if they have one
function questionsWithCards(db: Db, userId: string, curricula?: string[], extra?: SQL) {
  return db
    .select({ question: questions, card: reviewCards })
    .from(questions)
    .leftJoin(reviewCards, and(eq(reviewCards.questionId, questions.id), eq(reviewCards.userId, userId)))
    .where(and(curriculumFilter(curricula), extra));
}

// ===== Users =====

export async function deleteUser(db: Db, userId: string): Promise<boolean> {
  const [, , deleted] = await db.batch([
    db.delete(reviewCards).where(eq(reviewCards.userId, userId)),
    db.delete(sessions).where(eq(sessions.userId, userId)),
    db.delete(users).where(eq(users.id, userId)).returning({ id: users.id }),
  ]);
  return deleted.length > 0;
}

// ===== Questions =====

export async function getAllCurricula(db: Db): Promise<string[]> {
  const rows = await db.all<{ curriculum: string }>(
    sql`SELECT DISTINCT c.value AS curriculum FROM questions, json_each(questions.curricula) c ORDER BY c.value`,
  );
  return rows.map((r) => r.curriculum);
}

export async function deleteQuestion(db: Db, id: string): Promise<boolean> {
  const [, deleted] = await db.batch([
    db.delete(reviewCards).where(eq(reviewCards.questionId, id)),
    db.delete(questions).where(eq(questions.id, id)).returning({ id: questions.id }),
  ]);
  return deleted.length > 0;
}

export async function deleteAllQuestions(db: Db): Promise<number> {
  const [, deleted] = await db.batch([
    db.delete(reviewCards),
    db.delete(questions).returning({ id: questions.id }),
  ]);
  return deleted.length;
}

// Creates or updates questions in a few statements, however many there are. If an update changes
// what a question asks or accepts, everyone's progress on it is reset; a change of category or
// curricula alone keeps progress.
export async function upsertQuestions(
  db: Db,
  rows: InsertQuestion[],
): Promise<{ created: number; updated: number; progressReset: number }> {
  const ids = rows.map((row) => row.id);

  // Split into JSON arrays that each fit in one bound value
  const chunks: string[] = [];
  let current: string[] = [];
  let size = 0;
  for (const row of rows) {
    const json = JSON.stringify(row);
    if (current.length > 0 && size + json.length > MAX_JSON_CHUNK) {
      chunks.push(`[${current.join(",")}]`);
      current = [];
      size = 0;
    }
    current.push(json);
    size += json.length + 1;
  }
  if (current.length > 0) chunks.push(`[${current.join(",")}]`);

  // Raw D1 statements: drizzle's batch only takes its own query builders
  const d1 = db.$client;

  const existing = await d1
    .prepare("SELECT id FROM questions WHERE id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(ids))
    .all<{ id: string }>();

  // Existing questions whose content changes. JSON columns go through json() so formatting
  // differences don't count as changes.
  const findChanged = d1.prepare(`
    SELECT q.id FROM questions q JOIN json_each(?) u ON q.id = json_extract(u.value, '$.id')
    WHERE q.question IS NOT json_extract(u.value, '$.question')
      OR q.question_type IS NOT coalesce(json_extract(u.value, '$.questionType'), 'single')
      OR json(q.options) IS NOT json(json_extract(u.value, '$.options'))
      OR q.correct_answer IS NOT json_extract(u.value, '$.correctAnswer')
      OR json(q.correct_answers) IS NOT json(json_extract(u.value, '$.correctAnswers'))
      OR json(q.region_polygon) IS NOT json(json_extract(u.value, '$.regionPolygon'))
      OR q.region_name IS NOT json_extract(u.value, '$.regionName')
  `);
  const changedIds = new Set<string>();
  for (const chunk of chunks) {
    const { results } = await findChanged.bind(chunk).all<{ id: string }>();
    for (const { id } of results) changedIds.add(id);
  }

  const upsert = d1.prepare(`
    INSERT INTO questions (id, question, question_type, options, correct_answer, correct_answers, region_polygon, region_name, category, curricula)
    SELECT
      json_extract(value, '$.id'),
      json_extract(value, '$.question'),
      coalesce(json_extract(value, '$.questionType'), 'single'),
      json_extract(value, '$.options'),
      json_extract(value, '$.correctAnswer'),
      json_extract(value, '$.correctAnswers'),
      json_extract(value, '$.regionPolygon'),
      json_extract(value, '$.regionName'),
      json_extract(value, '$.category'),
      json_extract(value, '$.curricula')
    FROM json_each(?) WHERE true
    ON CONFLICT(id) DO UPDATE SET
      question = excluded.question,
      question_type = excluded.question_type,
      options = excluded.options,
      correct_answer = excluded.correct_answer,
      correct_answers = excluded.correct_answers,
      region_polygon = excluded.region_polygon,
      region_name = excluded.region_name,
      category = excluded.category,
      curricula = excluded.curricula
  `);
  const resetProgress = d1
    .prepare("DELETE FROM review_cards WHERE question_id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify([...changedIds]));
  await d1.batch([resetProgress, ...chunks.map((chunk) => upsert.bind(chunk))]);

  const updated = new Set(existing.results.map((row) => row.id)).size;
  return { created: new Set(ids).size - updated, updated, progressReset: changedIds.size };
}

// ===== Quiz =====

export async function getDueQuestions(db: Db, userId: string, curricula?: string[]): Promise<Question[]> {
  const rows = await questionsWithCards(
    db,
    userId,
    curricula,
    or(isNull(reviewCards.nextReviewDate), lte(reviewCards.nextReviewDate, new Date())),
  );
  return rows.map((row) => row.question);
}

export async function getQuestionWithCard(db: Db, userId: string, questionId: string) {
  const [row] = await questionsWithCards(db, userId, undefined, eq(questions.id, questionId));
  return row;
}

export async function saveReviewCard(db: Db, card: ReviewCard) {
  const { userId: _, questionId: __, ...progress } = card;
  await db
    .insert(reviewCards)
    .values(card)
    .onConflictDoUpdate({ target: [reviewCards.userId, reviewCards.questionId], set: progress });
}

function startOfToday(): Date {
  return new Date(Math.floor(Date.now() / DAY_MS) * DAY_MS); // UTC midnight
}

export async function countCompletedToday(db: Db, userId: string, curricula?: string[]): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(reviewCards)
    .innerJoin(questions, eq(questions.id, reviewCards.questionId))
    .where(and(
      eq(reviewCards.userId, userId),
      sql`${reviewCards.lastReviewDate} >= ${startOfToday().getTime()}`,
      curriculumFilter(curricula),
    ));
  return row?.count ?? 0;
}

// ===== Progress =====

export async function getProgressCards(db: Db, userId: string, curricula?: string[]): Promise<ProgressCard[]> {
  const now = new Date();
  const rows = await questionsWithCards(db, userId, curricula);
  return rows.map(({ question: q, card }) => ({
    questionId: q.id,
    question: q.question,
    options: q.options ?? [],
    correctAnswer: q.correctAnswer,
    correctAnswers: q.correctAnswers,
    questionType: q.questionType,
    category: q.category,
    curricula: q.curricula,
    repetitions: card?.repetitions ?? NEW_CARD.repetitions,
    interval: card?.interval ?? NEW_CARD.interval,
    easeFactor: card?.easeFactor ?? NEW_CARD.easeFactor,
    nextReviewDate: (card?.nextReviewDate ?? now).toISOString(),
  }));
}

export async function getStatistics(db: Db, userId: string, curricula?: string[]): Promise<Statistics> {
  const [cards, completedToday] = await Promise.all([
    getProgressCards(db, userId, curricula),
    countCompletedToday(db, userId, curricula),
  ]);
  const now = Date.now();
  const weekFromNow = now + 7 * DAY_MS;
  const due = (card: ProgressCard) => Date.parse(card.nextReviewDate);

  return {
    totalQuestions: cards.length,
    masteredQuestions: cards.filter((c) => c.repetitions >= 3 && c.interval >= 21).length,
    learningQuestions: cards.filter((c) => c.repetitions > 0 && c.repetitions < 3).length,
    newQuestions: cards.filter((c) => c.repetitions === 0).length,
    dueToday: cards.filter((c) => due(c) <= now).length,
    dueThisWeek: cards.filter((c) => due(c) >= now && due(c) <= weekFromNow).length,
    completedToday,
    averageEaseFactor: cards.length > 0
      ? cards.reduce((sum, c) => sum + c.easeFactor, 0) / cards.length
      : NEW_CARD.easeFactor,
    totalReviews: cards.reduce((sum, c) => sum + c.repetitions, 0),
  };
}
