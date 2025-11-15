import {
  type Question,
  type InsertQuestion,
  type ReviewCard,
  type InsertReviewCard,
  type Statistics,
  type User,
  type UpsertUser,
  questions,
  reviewCards,
  users,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, lte, gte, sql } from "drizzle-orm";

export interface IStorage {
  // User methods (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  
  // Question methods
  createQuestion(question: InsertQuestion): Promise<Question>;
  createQuestions(questions: InsertQuestion[]): Promise<Question[]>;
  getQuestion(id: string): Promise<Question | undefined>;
  getAllQuestions(): Promise<Question[]>;
  updateQuestion(id: string, updates: Partial<InsertQuestion>): Promise<Question | undefined>;
  deleteQuestion(id: string): Promise<boolean>;
  
  // Review card methods (now user-specific)
  createReviewCard(card: InsertReviewCard): Promise<ReviewCard>;
  bulkCreateReviewCards(cards: Array<{ userId: string; questionId: string }>): Promise<void>;
  getReviewCard(id: string): Promise<ReviewCard | undefined>;
  getReviewCardByQuestionId(userId: string, questionId: string): Promise<ReviewCard | undefined>;
  updateReviewCard(id: string, updates: Partial<ReviewCard>): Promise<ReviewCard | undefined>;
  getDueReviewCards(userId: string): Promise<ReviewCard[]>;
  getDueCardsWithQuestions(userId: string): Promise<Array<{
    reviewCardId: string;
    questionId: string;
    question: string;
    options: string[];
    category: string | null;
  }>>;
  getAllReviewCards(userId: string): Promise<ReviewCard[]>;
  ensureUserReviewCards(userId: string): Promise<void>;
  
  // Statistics (now user-specific)
  getStatistics(userId: string): Promise<Statistics>;
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

  async getDueCardsWithQuestions(userId: string): Promise<Array<{
    reviewCardId: string;
    questionId: string;
    question: string;
    options: string[];
    category: string | null;
  }>> {
    const now = new Date();
    return await db
      .select({
        reviewCardId: reviewCards.id,
        questionId: questions.id,
        question: questions.question,
        options: questions.options,
        category: questions.category,
      })
      .from(reviewCards)
      .innerJoin(questions, eq(reviewCards.questionId, questions.id))
      .where(
        and(
          eq(reviewCards.userId, userId),
          lte(reviewCards.nextReviewDate, now)
        )
      );
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

  // Statistics (now user-specific)
  async getStatistics(userId: string): Promise<Statistics> {
    const allCards = await this.getAllReviewCards(userId);
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const masteredQuestions = allCards.filter(
      (card) => card.repetitions >= 3 && card.interval >= 21
    ).length;

    const learningQuestions = allCards.filter(
      (card) => card.repetitions > 0 && card.repetitions < 3
    ).length;

    const newQuestions = allCards.filter((card) => card.repetitions === 0).length;

    const dueToday = allCards.filter((card) => {
      const cardDate = new Date(card.nextReviewDate);
      return (
        cardDate.getFullYear() === now.getFullYear() &&
        cardDate.getMonth() === now.getMonth() &&
        cardDate.getDate() === now.getDate()
      );
    }).length;

    const dueThisWeek = allCards.filter(
      (card) => card.nextReviewDate >= now && card.nextReviewDate <= weekFromNow
    ).length;

    const averageEaseFactor =
      allCards.length > 0
        ? allCards.reduce((sum, card) => sum + card.easeFactor, 0) / allCards.length
        : 2.5;

    const totalReviews = allCards.reduce((sum, card) => sum + card.repetitions, 0);

    // Get total questions count from database
    const allQuestions = await this.getAllQuestions();

    return {
      totalQuestions: allQuestions.length,
      masteredQuestions,
      learningQuestions,
      newQuestions,
      dueToday,
      dueThisWeek,
      averageEaseFactor,
      totalReviews,
    };
  }
}

export const storage = new DatabaseStorage();
