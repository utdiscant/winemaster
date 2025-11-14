import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { calculateSM2, correctnessToQuality } from "./sm2";
import {
  jsonUploadSchema,
  answerSubmissionSchema,
  type QuizQuestion,
} from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Upload questions from JSON
  app.post("/api/questions/upload", async (req, res) => {
    try {
      const validatedData = jsonUploadSchema.parse(req.body);
      
      // Create questions and their review cards
      const questions = await storage.createQuestions(
        validatedData.questions.map((q) => ({
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          category: q.category,
        }))
      );

      // Create review cards for each question
      for (const question of questions) {
        await storage.createReviewCard({
          questionId: question.id,
        });
      }

      res.json({ success: true, count: questions.length });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get due questions for quiz
  app.get("/api/quiz/due", async (req, res) => {
    try {
      const dueCards = await storage.getDueReviewCards();
      
      // Shuffle due cards for variety
      const shuffledCards = dueCards.sort(() => Math.random() - 0.5);
      
      // Get questions for due cards
      const quizQuestions: QuizQuestion[] = [];
      for (const card of shuffledCards) {
        const question = await storage.getQuestion(card.questionId);
        if (question) {
          quizQuestions.push({
            id: question.id,
            question: question.question,
            options: question.options,
            category: question.category,
            reviewCardId: card.id,
          });
        }
      }

      res.json(quizQuestions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Submit answer and update SM-2
  app.post("/api/quiz/answer", async (req, res) => {
    try {
      const { questionId, selectedAnswer } = answerSubmissionSchema.parse(req.body);
      
      // Get question to check correct answer
      const question = await storage.getQuestion(questionId);
      if (!question) {
        return res.status(404).json({ error: "Question not found" });
      }

      // Check if answer is correct
      const isCorrect = selectedAnswer === question.correctAnswer;
      
      // Get review card
      const reviewCard = await storage.getReviewCardByQuestionId(questionId);
      if (!reviewCard) {
        return res.status(404).json({ error: "Review card not found" });
      }

      // Calculate SM-2 parameters
      const quality = correctnessToQuality(isCorrect);
      const sm2Result = calculateSM2(
        quality,
        reviewCard.easeFactor,
        reviewCard.interval,
        reviewCard.repetitions
      );

      // Update review card
      await storage.updateReviewCard(reviewCard.id, {
        easeFactor: sm2Result.easeFactor,
        interval: sm2Result.interval,
        repetitions: sm2Result.repetitions,
        nextReviewDate: sm2Result.nextReviewDate,
        lastReviewDate: new Date(),
      });

      res.json({
        correct: isCorrect,
        correctAnswer: question.correctAnswer,
        nextReviewDate: sm2Result.nextReviewDate,
        interval: sm2Result.interval,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get statistics
  app.get("/api/statistics", async (req, res) => {
    try {
      const stats = await storage.getStatistics();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
