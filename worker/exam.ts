import { desc, eq, sql } from "drizzle-orm";
import {
  EXAM_PASS_PERCENT,
  EXAM_WEIGHTS,
  LEARNING_OUTCOMES,
  examAttempts,
  examQuestions,
  videos,
  type ExamAttempt,
  type ExamPaperQuestion,
  type ExamQuestion,
  type ExamResult,
  type ExamVideo,
} from "@shared/schema";
import type { Db } from "./index";

// D1 caps a single bound value at 2 MB, so the bank is sent in pieces
const MAX_JSON_CHUNK = 1_000_000;

function jsonChunks(rows: unknown[]): string[] {
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
  return chunks;
}

// Replaces the whole exam bank and video list in one batch
export async function replaceExamBank(
  db: Db,
  bank: { videos: { id: string; title: string; url: string; section: string; duration?: string; course_order: number }[]; questions: unknown[] },
) {
  const d1 = db.$client;
  const insertVideos = d1.prepare(`
    INSERT INTO videos (id, title, url, section, duration, course_order)
    SELECT json_extract(value, '$.id'), json_extract(value, '$.title'), json_extract(value, '$.url'),
           json_extract(value, '$.section'), json_extract(value, '$.duration'), json_extract(value, '$.course_order')
    FROM json_each(?)
  `);
  const insertQuestions = d1.prepare(`
    INSERT INTO exam_questions (id, lo, category, question, options, correct, explanation, videos)
    SELECT json_extract(value, '$.id'), json_extract(value, '$.lo'), json_extract(value, '$.category'),
           json_extract(value, '$.question'), json_extract(value, '$.options'), json_extract(value, '$.correct'),
           json_extract(value, '$.explanation'), json_extract(value, '$.videos')
    FROM json_each(?)
  `);
  await d1.batch([
    d1.prepare("DELETE FROM exam_questions"),
    d1.prepare("DELETE FROM videos"),
    ...jsonChunks(bank.videos).map((chunk) => insertVideos.bind(chunk)),
    ...jsonChunks(bank.questions).map((chunk) => insertQuestions.bind(chunk)),
  ]);
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// How many questions to take from each learning outcome: the real exam's proportions scaled to `count`,
// moving any shortfall (an outcome with too few questions) to the others
function quotas(count: number, available: Map<number, number>): Map<number, number> {
  const los = Object.keys(EXAM_WEIGHTS).map(Number).filter((lo) => (available.get(lo) ?? 0) > 0);
  const result = new Map<number, number>(los.map((lo) => [lo, 0]));
  let remaining = Math.min(count, los.reduce((sum, lo) => sum + available.get(lo)!, 0));
  while (remaining > 0) {
    const open = los.filter((lo) => result.get(lo)! < available.get(lo)!);
    const weight = open.reduce((sum, lo) => sum + EXAM_WEIGHTS[lo], 0);
    // Largest-remainder split of what's left over the outcomes that still have questions
    const shares = open.map((lo) => ({ lo, exact: (remaining * EXAM_WEIGHTS[lo]) / weight }));
    let given = 0;
    for (const s of shares) {
      const take = Math.min(Math.floor(s.exact), available.get(s.lo)! - result.get(s.lo)!);
      result.set(s.lo, result.get(s.lo)! + take);
      given += take;
    }
    const byRemainder = shares.sort((a, b) => (b.exact % 1) - (a.exact % 1));
    for (const s of byRemainder) {
      if (given >= remaining) break;
      if (result.get(s.lo)! < available.get(s.lo)!) {
        result.set(s.lo, result.get(s.lo)! + 1);
        given++;
      }
    }
    if (given === 0) break;
    remaining -= given;
  }
  return result;
}

// The categories a user can be examined on: all, or all but their paused ones
function inScope(category: string, paused: string[] | null | undefined) {
  return !paused || !paused.includes(category);
}

export async function getExamInfo(db: Db, paused: string[] | null | undefined) {
  const rows = await db.select({ category: examQuestions.category }).from(examQuestions);
  return { bankSize: rows.length, available: rows.filter((r) => inScope(r.category, paused)).length };
}

// Draws an exam: `count` questions spread over the learning outcomes like the real exam, in random order
export async function startExam(db: Db, count: number, paused: string[] | null | undefined): Promise<ExamPaperQuestion[]> {
  const pool = (await db.select({ id: examQuestions.id, lo: examQuestions.lo, category: examQuestions.category }).from(examQuestions))
    .filter((q) => inScope(q.category, paused));
  const byLo = new Map<number, string[]>();
  for (const q of shuffle(pool)) byLo.set(q.lo, [...(byLo.get(q.lo) ?? []), q.id]);

  const take = quotas(count, new Map([...byLo].map(([lo, ids]) => [lo, ids.length])));
  const chosen = shuffle([...take].flatMap(([lo, n]) => byLo.get(lo)!.slice(0, n)));
  if (chosen.length === 0) return [];

  const rows = await db
    .select()
    .from(examQuestions)
    .where(sql`${examQuestions.id} IN (SELECT value FROM json_each(${JSON.stringify(chosen)}))`);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return chosen.map((id) => {
    const q = byId.get(id)!;
    return { id: q.id, question: q.question, options: q.options, category: q.category, lo: q.lo };
  });
}

// Marks an exam, records the attempt, and recommends videos for what was missed
export async function submitExam(
  db: Db,
  userId: string,
  answers: { questionId: string; choice: number | null }[],
): Promise<ExamResult | null> {
  const ids = answers.map((a) => a.questionId);
  const rows: ExamQuestion[] = await db
    .select()
    .from(examQuestions)
    .where(sql`${examQuestions.id} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const graded = answers.filter((a) => byId.has(a.questionId));
  if (graded.length === 0) return null;

  const videoIds = [...new Set(rows.flatMap((r) => r.videos))];
  const videoRows = videoIds.length === 0 ? [] : await db
    .select()
    .from(videos)
    .where(sql`${videos.id} IN (SELECT value FROM json_each(${JSON.stringify(videoIds)}))`);
  const videoById = new Map(videoRows.map((v) => [v.id, v]));
  const toExamVideo = (id: string): ExamVideo | undefined => {
    const v = videoById.get(id);
    return v && { id: v.id, title: v.title, url: v.url, section: v.section, duration: v.duration };
  };

  const questions = graded.map((a, i) => {
    const q = byId.get(a.questionId)!;
    return {
      id: q.id,
      number: i + 1,
      question: q.question,
      options: q.options,
      category: q.category,
      choice: a.choice,
      correct: q.correct,
      isCorrect: a.choice === q.correct,
      explanation: q.explanation,
      videos: q.videos.map(toExamVideo).filter((v): v is ExamVideo => !!v),
      lo: q.lo,
    };
  });

  // Rank videos by how many missed questions they cover; a video listed first for a question (its most
  // relevant) counts a little more, and ties follow the course order
  const score = new Map<string, { points: number; questionNumbers: number[] }>();
  for (const q of questions.filter((q) => !q.isCorrect)) {
    q.videos.forEach((v, rank) => {
      const entry = score.get(v.id) ?? { points: 0, questionNumbers: [] };
      entry.points += rank === 0 ? 1 : 0.6;
      entry.questionNumbers.push(q.number);
      score.set(v.id, entry);
    });
  }
  const recommendedVideos = [...score]
    .sort(([a, x], [b, y]) => y.points - x.points || videoById.get(a)!.courseOrder - videoById.get(b)!.courseOrder)
    .map(([id, { questionNumbers }]) => ({ ...toExamVideo(id)!, questionNumbers }));

  const byLearningOutcome = Object.keys(EXAM_WEIGHTS).map(Number)
    .map((lo) => {
      const inLo = questions.filter((q) => q.lo === lo);
      return { lo, name: LEARNING_OUTCOMES[lo], correct: inLo.filter((q) => q.isCorrect).length, total: inLo.length };
    })
    .filter((l) => l.total > 0);

  const correctCount = questions.filter((q) => q.isCorrect).length;
  const percent = Math.round((correctCount / questions.length) * 100);
  await db.insert(examAttempts).values({ userId, takenAt: new Date(), total: questions.length, correctCount });

  return {
    total: questions.length,
    correctCount,
    percent,
    passed: percent >= EXAM_PASS_PERCENT,
    byLearningOutcome,
    questions: questions.map(({ lo: _, ...q }) => q),
    recommendedVideos,
  };
}

export async function getExamAttempts(db: Db, userId: string): Promise<ExamAttempt[]> {
  const rows = await db
    .select()
    .from(examAttempts)
    .where(eq(examAttempts.userId, userId))
    .orderBy(desc(examAttempts.takenAt))
    .limit(20);
  return rows.map((r) => ({ id: r.id, takenAt: r.takenAt.toISOString(), total: r.total, correctCount: r.correctCount }));
}
