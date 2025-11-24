import {
  type Question,
  type InsertQuestion,
  type ReviewCard,
  type InsertReviewCard,
  type Statistics,
  type User,
  type UpsertUser,
  type TastingNote,
  type BlindTastingSession,
  type InsertBlindTastingSession,
  questions,
  reviewCards,
  users,
  tastingNotes,
  blindTastingSessions,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, lte, gte, sql } from "drizzle-orm";

export interface IStorage {
  // User methods (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUserCurricula(userId: string, curricula: string[]): Promise<User | undefined>;
  deleteUser(userId: string): Promise<boolean>;
  
  // Question methods
  createQuestion(question: InsertQuestion): Promise<Question>;
  createQuestions(questions: InsertQuestion[]): Promise<Question[]>;
  getQuestion(id: string): Promise<Question | undefined>;
  getAllQuestions(): Promise<Question[]>;
  updateQuestion(id: string, updates: Partial<InsertQuestion>): Promise<Question | undefined>;
  deleteQuestion(id: string): Promise<boolean>;
  deleteAllQuestions(): Promise<{ count: number }>;
  getAllCurricula(): Promise<string[]>;
  deleteReviewCardsByQuestionId(questionId: string): Promise<void>;
  
  // Review card methods (now user-specific)
  createReviewCard(card: InsertReviewCard): Promise<ReviewCard>;
  bulkCreateReviewCards(cards: Array<{ userId: string; questionId: string }>): Promise<void>;
  getReviewCard(id: string): Promise<ReviewCard | undefined>;
  getReviewCardByQuestionId(userId: string, questionId: string): Promise<ReviewCard | undefined>;
  updateReviewCard(id: string, updates: Partial<ReviewCard>): Promise<ReviewCard | undefined>;
  getDueReviewCards(userId: string): Promise<ReviewCard[]>;
  getDueCardsWithQuestions(userId: string, curricula?: string[], limit?: number): Promise<Array<{
    reviewCardId: string;
    questionId: string;
    question: string;
    questionType: string;
    options: string[];
    category: string | null;
    curriculum: string | null;
    regionPolygon: any;
    regionName: string | null;
    nextReviewDate: Date;
  }>>;
  getAllReviewCards(userId: string): Promise<ReviewCard[]>;
  ensureUserReviewCards(userId: string): Promise<void>;
  getReviewsCompletedToday(userId: string, curricula?: string[]): Promise<number>;
  getReviewCardsWithQuestions(userId: string): Promise<Array<{
    reviewCardId: string;
    questionId: string;
    question: string;
    options: string[];
    correctAnswer: number | null;
    correctAnswers: number[] | null;
    questionType: string;
    category: string | null;
    curriculum: string | null;
    repetitions: number;
    interval: number;
    nextReviewDate: Date;
    easeFactor: number;
  }>>;
  
  // Statistics (now user-specific)
  getStatistics(userId: string, curricula?: string[]): Promise<Statistics>;
  
  // Blind tasting methods
  getAllTastingNotes(): Promise<TastingNote[]>;
  getTastingNote(id: string): Promise<TastingNote | undefined>;
  createBlindTastingSession(userId: string, targetWineId: string): Promise<BlindTastingSession>;
  getBlindTastingSession(sessionId: string): Promise<BlindTastingSession | undefined>;
  getCurrentBlindTastingSession(userId: string): Promise<BlindTastingSession | undefined>;
  updateBlindTastingSession(sessionId: string, updates: Partial<BlindTastingSession>): Promise<BlindTastingSession | undefined>;
  eliminateWine(sessionId: string, wineId: string): Promise<BlindTastingSession | undefined>;
  unEliminateWine(sessionId: string, wineId: string): Promise<BlindTastingSession | undefined>;
  advanceClue(sessionId: string): Promise<BlindTastingSession | undefined>;
  completeBlindTastingSession(sessionId: string): Promise<BlindTastingSession | undefined>;
  deleteBlindTastingSession(sessionId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // User methods (required for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async updateUserCurricula(userId: string, curricula: string[]): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ selectedCurricula: curricula, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async deleteUser(userId: string): Promise<boolean> {
    // First delete all review cards for this user
    await db.delete(reviewCards).where(eq(reviewCards.userId, userId));
    
    // Then delete the user and check if a row was actually deleted
    const result = await db.delete(users).where(eq(users.id, userId)).returning();
    return result.length > 0;
  }

  // Question methods
  async createQuestion(insertQuestion: InsertQuestion): Promise<Question> {
    const [question] = await db
      .insert(questions)
      .values(insertQuestion)
      .returning();
    return question;
  }

  async createQuestions(insertQuestions: InsertQuestion[]): Promise<Question[]> {
    if (insertQuestions.length === 0) return [];
    const createdQuestions = await db
      .insert(questions)
      .values(insertQuestions)
      .returning();
    return createdQuestions;
  }

  async getQuestion(id: string): Promise<Question | undefined> {
    const [question] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, id));
    return question;
  }

  async getAllQuestions(): Promise<Question[]> {
    return await db.select().from(questions);
  }

  async updateQuestion(id: string, updates: Partial<InsertQuestion>): Promise<Question | undefined> {
    const [question] = await db
      .update(questions)
      .set(updates)
      .where(eq(questions.id, id))
      .returning();
    return question;
  }

  async deleteQuestion(id: string): Promise<boolean> {
    // First delete all review cards for this question
    await db.delete(reviewCards).where(eq(reviewCards.questionId, id));
    
    // Then delete the question
    const result = await db
      .delete(questions)
      .where(eq(questions.id, id))
      .returning();
    return result.length > 0;
  }

  async deleteAllQuestions(): Promise<{ count: number }> {
    // First, get count of questions
    const allQuestions = await db.select().from(questions);
    const count = allQuestions.length;
    
    // Delete all review cards first (cascading)
    await db.delete(reviewCards);
    
    // Then delete all questions
    await db.delete(questions);
    
    return { count };
  }

  async getAllCurricula(): Promise<string[]> {
    const result = await db
      .selectDistinct({ curriculum: questions.curriculum })
      .from(questions)
      .where(sql`${questions.curriculum} IS NOT NULL`);
    
    return result
      .map(r => r.curriculum)
      .filter((c): c is string => c !== null)
      .sort();
  }

  async deleteReviewCardsByQuestionId(questionId: string): Promise<void> {
    await db.delete(reviewCards).where(eq(reviewCards.questionId, questionId));
  }

  // Review card methods (now user-specific)
  async createReviewCard(insertCard: InsertReviewCard): Promise<ReviewCard> {
    const [card] = await db
      .insert(reviewCards)
      .values(insertCard)
      .returning();
    return card;
  }

  async bulkCreateReviewCards(cards: Array<{ userId: string; questionId: string }>): Promise<void> {
    if (cards.length === 0) return;
    
    const newCards = cards.map(c => ({
      userId: c.userId,
      questionId: c.questionId,
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
      nextReviewDate: new Date(),
      lastReviewDate: null,
    }));
    
    await db.insert(reviewCards).values(newCards).onConflictDoNothing();
  }

  async getReviewCard(id: string): Promise<ReviewCard | undefined> {
    const [card] = await db
      .select()
      .from(reviewCards)
      .where(eq(reviewCards.id, id));
    return card;
  }

  async getReviewCardByQuestionId(userId: string, questionId: string): Promise<ReviewCard | undefined> {
    const [card] = await db
      .select()
      .from(reviewCards)
      .where(
        and(
          eq(reviewCards.userId, userId),
          eq(reviewCards.questionId, questionId)
        )
      );
    return card;
  }

  async getQuestionWithReviewCard(userId: string, questionId: string): Promise<{
    questionId: string;
    question: string;
    questionType: string;
    options: string[];
    correctAnswer: number | null;
    correctAnswers: number[] | null;
    regionPolygon: any;
    regionName: string | null;
    reviewCardId: string;
    easeFactor: number;
    interval: number;
    repetitions: number;
  } | undefined> {
    const [result] = await db
      .select({
        questionId: questions.id,
        question: questions.question,
        questionType: questions.questionType,
        options: questions.options,
        correctAnswer: questions.correctAnswer,
        correctAnswers: questions.correctAnswers,
        regionPolygon: questions.regionPolygon,
        regionName: questions.regionName,
        reviewCardId: reviewCards.id,
        easeFactor: reviewCards.easeFactor,
        interval: reviewCards.interval,
        repetitions: reviewCards.repetitions,
      })
      .from(questions)
      .innerJoin(reviewCards, and(
        eq(reviewCards.questionId, questions.id),
        eq(reviewCards.userId, userId)
      ))
      .where(eq(questions.id, questionId));
    
    if (!result) return undefined;
    
    return {
      ...result,
      options: result.options || [], // Handle nullable options for text-to-map questions
    };
  }

  async updateReviewCard(
    id: string,
    updates: Partial<ReviewCard>
  ): Promise<ReviewCard | undefined> {
    const [card] = await db
      .update(reviewCards)
      .set(updates)
      .where(eq(reviewCards.id, id))
      .returning();
    return card;
  }

  async getDueReviewCards(userId: string): Promise<ReviewCard[]> {
    const now = new Date();
    return await db
      .select()
      .from(reviewCards)
      .where(
        and(
          eq(reviewCards.userId, userId),
          lte(reviewCards.nextReviewDate, now)
        )
      );
  }

  async getDueCardsWithQuestions(userId: string, curricula?: string[], limit?: number): Promise<Array<{
    reviewCardId: string;
    questionId: string;
    question: string;
    questionType: string;
    options: string[];
    category: string | null;
    curriculum: string | null;
    regionPolygon: any;
    regionName: string | null;
    nextReviewDate: Date;
  }>> {
    const now = new Date();
    
    // Build where conditions
    const conditions = [
      eq(reviewCards.userId, userId),
      lte(reviewCards.nextReviewDate, now)
    ];
    
    // Add curricula filter if provided (OR condition for multiple curricula)
    if (curricula && curricula.length > 0) {
      const curriculumConditions = curricula.map(c => eq(questions.curriculum, c));
      conditions.push(sql`(${sql.join(curriculumConditions, sql` OR `)})`);
    }
    
    let query = db
      .select({
        reviewCardId: reviewCards.id,
        questionId: questions.id,
        question: questions.question,
        questionType: questions.questionType,
        options: questions.options,
        category: questions.category,
        regionPolygon: questions.regionPolygon,
        regionName: questions.regionName,
        curriculum: questions.curriculum,
        nextReviewDate: reviewCards.nextReviewDate,
      })
      .from(reviewCards)
      .innerJoin(questions, eq(reviewCards.questionId, questions.id))
      .where(and(...conditions))
      .orderBy(reviewCards.nextReviewDate); // Sort by earliest due date first (highest priority)
    
    // Apply limit if provided
    if (limit !== undefined && limit > 0) {
      query = query.limit(limit) as any;
    }
    
    const results = await query;
    
    return results.map(r => ({
      ...r,
      options: r.options || [], // Handle nullable options for text-to-map questions
    }));
  }

  async getAllReviewCards(userId: string): Promise<ReviewCard[]> {
    return await db
      .select()
      .from(reviewCards)
      .where(eq(reviewCards.userId, userId));
  }

  async ensureUserReviewCards(userId: string): Promise<void> {
    // Get all questions
    const allQuestions = await this.getAllQuestions();
    
    // Get existing review cards for this user
    const existingCards = await this.getAllReviewCards(userId);
    const existingQuestionIds = new Set(existingCards.map(card => card.questionId));
    
    // Find questions without review cards
    const missingQuestions = allQuestions.filter(q => !existingQuestionIds.has(q.id));
    
    // Create review cards for missing questions with bulk insert
    if (missingQuestions.length > 0) {
      const newCards = missingQuestions.map(q => ({
        userId,
        questionId: q.id,
        easeFactor: 2.5,
        interval: 0,
        repetitions: 0,
        nextReviewDate: new Date(),
        lastReviewDate: null,
      }));
      
      await db.insert(reviewCards).values(newCards).onConflictDoNothing();
    }
  }

  async getReviewCardsWithQuestions(userId: string): Promise<Array<{
    reviewCardId: string;
    questionId: string;
    question: string;
    options: string[];
    correctAnswer: number | null;
    correctAnswers: number[] | null;
    questionType: string;
    category: string | null;
    curriculum: string | null;
    repetitions: number;
    interval: number;
    nextReviewDate: Date;
    easeFactor: number;
  }>> {
    const results = await db
      .select({
        reviewCardId: reviewCards.id,
        questionId: questions.id,
        question: questions.question,
        options: questions.options,
        correctAnswer: questions.correctAnswer,
        correctAnswers: questions.correctAnswers,
        questionType: questions.questionType,
        category: questions.category,
        curriculum: questions.curriculum,
        repetitions: reviewCards.repetitions,
        interval: reviewCards.interval,
        nextReviewDate: reviewCards.nextReviewDate,
        easeFactor: reviewCards.easeFactor,
      })
      .from(reviewCards)
      .innerJoin(questions, eq(reviewCards.questionId, questions.id))
      .where(eq(reviewCards.userId, userId));
    
    return results.map(r => ({
      ...r,
      options: r.options || [], // Handle nullable options for text-to-map questions
    }));
  }

  // Get count of reviews completed today
  async getReviewsCompletedToday(userId: string, curricula?: string[]): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    
    // Build where conditions
    const conditions = [
      eq(reviewCards.userId, userId),
      gte(reviewCards.lastReviewDate, startOfDay),
      lte(reviewCards.lastReviewDate, endOfDay)
    ];
    
    // If curricula filter provided, join with questions table
    if (curricula && curricula.length > 0) {
      const results = await db
        .select({ count: sql<number>`count(*)` })
        .from(reviewCards)
        .innerJoin(questions, eq(reviewCards.questionId, questions.id))
        .where(and(
          ...conditions,
          sql`(${sql.join(curricula.map(c => eq(questions.curriculum, c)), sql` OR `)})`
        ));
      
      return Number(results[0]?.count ?? 0);
    }
    
    // No curricula filter - count directly from review cards
    const results = await db
      .select({ count: sql<number>`count(*)` })
      .from(reviewCards)
      .where(and(...conditions));
    
    return Number(results[0]?.count ?? 0);
  }

  // Statistics (now user-specific with curriculum filtering)
  async getStatistics(userId: string, curricula?: string[]): Promise<Statistics> {
    // Get all review cards with questions to filter by curriculum
    const allCardsWithQuestions = await this.getReviewCardsWithQuestions(userId);
    
    // Filter by curricula if provided
    let filteredCards = allCardsWithQuestions;
    if (curricula && curricula.length > 0) {
      filteredCards = allCardsWithQuestions.filter(card => 
        card.curriculum && curricula.includes(card.curriculum)
      );
    }
    
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const masteredQuestions = filteredCards.filter(
      (card) => card.repetitions >= 3 && card.interval >= 21
    ).length;

    const learningQuestions = filteredCards.filter(
      (card) => card.repetitions > 0 && card.repetitions < 3
    ).length;

    const newQuestions = filteredCards.filter((card) => card.repetitions === 0).length;

    const dueToday = filteredCards.filter((card) => {
      const cardDate = new Date(card.nextReviewDate);
      return cardDate <= now;
    }).length;

    const dueThisWeek = filteredCards.filter(
      (card) => card.nextReviewDate >= now && card.nextReviewDate <= weekFromNow
    ).length;

    const averageEaseFactor =
      filteredCards.length > 0
        ? filteredCards.reduce((sum, card) => sum + card.easeFactor, 0) / filteredCards.length
        : 2.5;

    const totalReviews = filteredCards.reduce((sum, card) => sum + card.repetitions, 0);

    // Get count of reviews completed today
    const completedToday = await this.getReviewsCompletedToday(userId, curricula);

    // Get total questions count (filtered by curriculum if provided)
    const allQuestions = await this.getAllQuestions();
    const totalQuestions = curricula && curricula.length > 0
      ? allQuestions.filter(q => q.curriculum && curricula.includes(q.curriculum)).length
      : allQuestions.length;

    return {
      totalQuestions,
      masteredQuestions,
      learningQuestions,
      newQuestions,
      dueToday,
      dueThisWeek,
      completedToday,
      averageEaseFactor,
      totalReviews,
    };
  }

  // Blind tasting methods
  async getAllTastingNotes(): Promise<TastingNote[]> {
    return await db.select().from(tastingNotes);
  }

  async getTastingNote(id: string): Promise<TastingNote | undefined> {
    const [note] = await db.select().from(tastingNotes).where(eq(tastingNotes.id, id));
    return note;
  }

  async createBlindTastingSession(userId: string, targetWineId: string): Promise<BlindTastingSession> {
    const [session] = await db
      .insert(blindTastingSessions)
      .values({
        userId,
        targetWineId,
        currentClueStage: 0,
        eliminatedWines: [],
        completed: false,
      })
      .returning();
    return session;
  }

  async getBlindTastingSession(sessionId: string): Promise<BlindTastingSession | undefined> {
    const [session] = await db
      .select()
      .from(blindTastingSessions)
      .where(eq(blindTastingSessions.id, sessionId));
    return session;
  }

  async getCurrentBlindTastingSession(userId: string): Promise<BlindTastingSession | undefined> {
    const [session] = await db
      .select()
      .from(blindTastingSessions)
      .where(and(
        eq(blindTastingSessions.userId, userId),
        eq(blindTastingSessions.completed, false)
      ))
      .orderBy(sql`${blindTastingSessions.createdAt} DESC`)
      .limit(1);
    return session;
  }

  async updateBlindTastingSession(
    sessionId: string,
    updates: Partial<BlindTastingSession>
  ): Promise<BlindTastingSession | undefined> {
    const [session] = await db
      .update(blindTastingSessions)
      .set(updates)
      .where(eq(blindTastingSessions.id, sessionId))
      .returning();
    return session;
  }

  async eliminateWine(sessionId: string, wineId: string): Promise<BlindTastingSession | undefined> {
    const session = await this.getBlindTastingSession(sessionId);
    if (!session) return undefined;

    // Create new array to avoid mutation
    const currentEliminated = session.eliminatedWines || [];
    const eliminatedWines = currentEliminated.includes(wineId)
      ? currentEliminated
      : [...currentEliminated, wineId];

    return await this.updateBlindTastingSession(sessionId, { eliminatedWines });
  }

  async unEliminateWine(sessionId: string, wineId: string): Promise<BlindTastingSession | undefined> {
    const session = await this.getBlindTastingSession(sessionId);
    if (!session) return undefined;

    // Create new array without the wine ID
    const eliminatedWines = (session.eliminatedWines || []).filter(id => id !== wineId);
    return await this.updateBlindTastingSession(sessionId, { eliminatedWines });
  }

  async advanceClue(sessionId: string): Promise<BlindTastingSession | undefined> {
    const session = await this.getBlindTastingSession(sessionId);
    if (!session) return undefined;

    const nextStage = Math.min(session.currentClueStage + 1, 2);
    return await this.updateBlindTastingSession(sessionId, { currentClueStage: nextStage });
  }

  async completeBlindTastingSession(sessionId: string): Promise<BlindTastingSession | undefined> {
    return await this.updateBlindTastingSession(sessionId, { completed: true });
  }

  async deleteBlindTastingSession(sessionId: string): Promise<boolean> {
    const result = await db
      .delete(blindTastingSessions)
      .where(eq(blindTastingSessions.id, sessionId))
      .returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
