import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { calculateSM2, correctnessToQuality } from "./sm2";
import {
  jsonUploadSchema,
  answerSubmissionSchema,
  type QuizQuestion,
  insertQuestionSchema,
} from "@shared/schema";
import { setupAuth, isAuthenticated, isAdmin } from "./replitAuth";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  await setupAuth(app);

  // Dev-only: Quick admin login for testing
  if (process.env.NODE_ENV === 'development') {
    app.get('/api/dev/login-admin', async (req: any, res) => {
      try {
        const testAdminId = 'dev-admin-user';
        const testAdmin = {
          id: testAdminId,
          email: 'admin@winemaster.dev',
          name: 'Test Admin',
          isAdmin: true,
        };

        // Create or update test admin user
        await storage.upsertUser({
          id: testAdminId,
          email: testAdmin.email,
          firstName: 'Test',
          lastName: 'Admin',
          isAdmin: true,
        });

        // Ensure admin has review cards
        await storage.ensureUserReviewCards(testAdminId);

        // Create a session matching the OAuth flow structure
        const devUser = {
          claims: {
            sub: testAdminId,
            email: testAdmin.email,
            first_name: 'Test',
            last_name: 'Admin',
          }
        };
        
        req.login(devUser, (err: any) => {
          if (err) {
            console.error("Dev login error:", err);
            return res.status(500).json({ error: "Failed to create dev session" });
          }
          res.redirect('/');
        });
      } catch (error) {
        console.error("Dev admin login error:", error);
        res.status(500).json({ error: "Failed to login as dev admin" });
      }
    });

    app.get('/api/dev/login-user', async (req: any, res) => {
      try {
        const testUserId = 'dev-regular-user';
        const testUser = {
          id: testUserId,
          email: 'user@winemaster.dev',
          name: 'Test User',
          isAdmin: false,
        };

        // Create or update test user
        await storage.upsertUser({
          id: testUserId,
          email: testUser.email,
          firstName: 'Test',
          lastName: 'User',
          isAdmin: false,
        });

        // Ensure user has review cards
        await storage.ensureUserReviewCards(testUserId);

        // Create a session matching the OAuth flow structure
        const devUser = {
          claims: {
            sub: testUserId,
            email: testUser.email,
            first_name: 'Test',
            last_name: 'User',
          }
        };
        
        req.login(devUser, (err: any) => {
          if (err) {
            console.error("Dev login error:", err);
            return res.status(500).json({ error: "Failed to create dev session" });
          }
          res.redirect('/');
        });
      } catch (error) {
        console.error("Dev user login error:", error);
        res.status(500).json({ error: "Failed to login as dev user" });
      }
    });
  }

  // Auth routes
  // Public session endpoint - doesn't require auth, returns user if logged in or null
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.claims?.sub) {
        return res.json(null);
      }
      
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Upload questions from JSON (admin only)
  app.post("/api/questions/upload", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const validatedData = jsonUploadSchema.parse(req.body);
      
      // Create questions (shared app-wide)
      const questions = await storage.createQuestions(
        validatedData.questions.map((q) => ({
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          category: q.category,
        }))
      );

      // Create review cards for all existing users (bulk insert)
      const allUsers = await storage.getAllUsers();
      if (allUsers.length > 0 && questions.length > 0) {
        const newCards = [];
        for (const user of allUsers) {
          for (const question of questions) {
            newCards.push({
              userId: user.id,
              questionId: question.id,
            });
          }
        }
        await storage.bulkCreateReviewCards(newCards);
      }

      res.json({ success: true, count: questions.length });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get all questions (admin only)
  app.get("/api/questions", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const questions = await storage.getAllQuestions();
      res.json(questions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update a question (admin only)
  app.patch("/api/questions/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = insertQuestionSchema.partial().parse(req.body);
      
      const question = await storage.updateQuestion(id, updates);
      if (!question) {
        return res.status(404).json({ error: "Question not found" });
      }

      res.json(question);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete a question (admin only)
  app.delete("/api/questions/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteQuestion(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Question not found" });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get due questions for quiz (user-specific)
  app.get("/api/quiz/due", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Ensure user has review cards for all questions
      await storage.ensureUserReviewCards(userId);
      
      // Get due cards with questions in single optimized query
      const dueCardsWithQuestions = await storage.getDueCardsWithQuestions(userId);
      
      // Shuffle for variety
      const shuffled = dueCardsWithQuestions.sort(() => Math.random() - 0.5);
      
      // Map to QuizQuestion format
      const quizQuestions: QuizQuestion[] = shuffled.map((row) => ({
        id: row.questionId,
        question: row.question,
        options: row.options,
        category: row.category ?? undefined,
        reviewCardId: row.reviewCardId,
      }));

      res.json(quizQuestions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Submit answer and update SM-2 (user-specific)
  app.post("/api/quiz/answer", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { questionId, selectedAnswer } = answerSubmissionSchema.parse(req.body);
      
      // Ensure user has review cards for all questions
      await storage.ensureUserReviewCards(userId);
      
      // Get question to check correct answer
      const question = await storage.getQuestion(questionId);
      if (!question) {
        return res.status(404).json({ error: "Question not found" });
      }

      // Check if answer is correct
      const isCorrect = selectedAnswer === question.correctAnswer;
      
      // Get review card for this user
      const reviewCard = await storage.getReviewCardByQuestionId(userId, questionId);
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

  // Get statistics (user-specific)
  app.get("/api/statistics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Ensure user has review cards for all questions
      await storage.ensureUserReviewCards(userId);
      
      const stats = await storage.getStatistics(userId);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
