import {
  type Question,
  type InsertQuestion,
  type ReviewCard,
  type InsertReviewCard,
  type Statistics,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Question methods
  createQuestion(question: InsertQuestion): Promise<Question>;
  createQuestions(questions: InsertQuestion[]): Promise<Question[]>;
  getQuestion(id: string): Promise<Question | undefined>;
  getAllQuestions(): Promise<Question[]>;
  
  // Review card methods
  createReviewCard(card: InsertReviewCard): Promise<ReviewCard>;
  getReviewCard(id: string): Promise<ReviewCard | undefined>;
  getReviewCardByQuestionId(questionId: string): Promise<ReviewCard | undefined>;
  updateReviewCard(id: string, updates: Partial<ReviewCard>): Promise<ReviewCard | undefined>;
  getDueReviewCards(): Promise<ReviewCard[]>;
  getAllReviewCards(): Promise<ReviewCard[]>;
  
  // Statistics
  getStatistics(): Promise<Statistics>;
}

export class MemStorage implements IStorage {
  private questions: Map<string, Question>;
  private reviewCards: Map<string, ReviewCard>;

  constructor() {
    this.questions = new Map();
    this.reviewCards = new Map();
  }

  // Question methods
  async createQuestion(insertQuestion: InsertQuestion): Promise<Question> {
    const id = randomUUID();
    const question: Question = { ...insertQuestion, id };
    this.questions.set(id, question);
    return question;
  }

  async createQuestions(insertQuestions: InsertQuestion[]): Promise<Question[]> {
    const questions: Question[] = [];
    for (const insertQuestion of insertQuestions) {
      const question = await this.createQuestion(insertQuestion);
      questions.push(question);
    }
    return questions;
  }

  async getQuestion(id: string): Promise<Question | undefined> {
    return this.questions.get(id);
  }

  async getAllQuestions(): Promise<Question[]> {
    return Array.from(this.questions.values());
  }

  // Review card methods
  async createReviewCard(insertCard: InsertReviewCard): Promise<ReviewCard> {
    const id = randomUUID();
    const card: ReviewCard = {
      id,
      questionId: insertCard.questionId,
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
      nextReviewDate: new Date(),
      lastReviewDate: insertCard.lastReviewDate ?? null,
    };
    this.reviewCards.set(id, card);
    return card;
  }

  async getReviewCard(id: string): Promise<ReviewCard | undefined> {
    return this.reviewCards.get(id);
  }

  async getReviewCardByQuestionId(questionId: string): Promise<ReviewCard | undefined> {
    return Array.from(this.reviewCards.values()).find(
      (card) => card.questionId === questionId
    );
  }

  async updateReviewCard(
    id: string,
    updates: Partial<ReviewCard>
  ): Promise<ReviewCard | undefined> {
    const card = this.reviewCards.get(id);
    if (!card) return undefined;

    const updatedCard = { ...card, ...updates };
    this.reviewCards.set(id, updatedCard);
    return updatedCard;
  }

  async getDueReviewCards(): Promise<ReviewCard[]> {
    const now = new Date();
    return Array.from(this.reviewCards.values()).filter(
      (card) => card.nextReviewDate <= now
    );
  }

  async getAllReviewCards(): Promise<ReviewCard[]> {
    return Array.from(this.reviewCards.values());
  }

  // Statistics
  async getStatistics(): Promise<Statistics> {
    const allCards = Array.from(this.reviewCards.values());
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

    return {
      totalQuestions: this.questions.size,
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

export const storage = new MemStorage();
