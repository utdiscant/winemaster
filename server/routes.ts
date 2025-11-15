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
import { z } from "zod";

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
          },
          // Add expires_at far in the future so isAuthenticated middleware accepts it
          expires_at: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // 1 year
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
          },
          // Add expires_at far in the future so isAuthenticated middleware accepts it
          expires_at: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // 1 year
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

  // Update user curriculum preferences
  app.patch('/api/user/curricula', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate request body
      const curriculaSchema = z.object({
        curricula: z.array(z.string()).max(20, "Maximum 20 curricula allowed"),
      });
      
      const validation = curriculaSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.message });
      }
      
      const { curricula } = validation.data;
      
      const user = await storage.updateUserCurricula(userId, curricula);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json(user);
    } catch (error: any) {
      console.error("Error updating user curricula:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all users (admin only)
  app.get('/api/users', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error: any) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete user (admin only)
  app.delete('/api/users/:id', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userIdToDelete = req.params.id;
      const currentUserId = req.user.claims.sub;
      
      // Prevent deleting the currently logged-in user
      if (userIdToDelete === currentUserId) {
        return res.status(400).json({ error: "You cannot delete your own account" });
      }
      
      const success = await storage.deleteUser(userIdToDelete);
      if (success) {
        res.json({ success: true, message: "User deleted successfully" });
      } else {
        res.status(404).json({ error: "User not found" });
      }
    } catch (error: any) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Upload questions from JSON (admin only)
  // Supports upsert: if question has ID and exists, updates it and clears all user progress
  // If question has no ID or doesn't exist, creates new question
  app.post("/api/questions/upload", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const validatedData = jsonUploadSchema.parse(req.body);
      
      let newQuestions = [];
      let updatedQuestions = [];
      
      // Process each question: upsert if ID provided, create if not
      for (const q of validatedData.questions) {
        let questionData;
        
        if (q.type === 'multi') {
          questionData = {
            id: q.id,
            question: q.question,
            questionType: 'multi' as const,
            options: q.options,
            correctAnswers: q.correctAnswers,
            category: q.category,
            curriculum: q.curriculum,
          };
        } else if (q.type === 'text-input') {
          questionData = {
            id: q.id,
            question: q.question,
            questionType: 'text-input' as const,
            options: q.acceptedAnswers, // Store accepted answers in options field
            category: q.category,
            curriculum: q.curriculum,
          };
        } else {
          questionData = {
            id: q.id,
            question: q.question,
            questionType: 'single' as const,
            options: q.options,
            correctAnswer: q.correctAnswer,
            category: q.category,
            curriculum: q.curriculum,
          };
        }
        
        if (q.id) {
          // Check if question exists
          const existingQuestion = await storage.getQuestion(q.id);
          
          if (existingQuestion) {
            // Update existing question and clear all user progress
            await storage.deleteReviewCardsByQuestionId(q.id);
            const updated = await storage.updateQuestion(q.id, questionData);
            if (updated) {
              updatedQuestions.push(updated);
            }
          } else {
            // Create new question with provided ID
            const created = await storage.createQuestion(questionData);
            newQuestions.push(created);
          }
        } else {
          // Create new question (ID auto-generated)
          const created = await storage.createQuestion(questionData);
          newQuestions.push(created);
        }
      }

      // Create review cards for new questions only
      const allUsers = await storage.getAllUsers();
      if (allUsers.length > 0 && newQuestions.length > 0) {
        const newCards = [];
        for (const user of allUsers) {
          for (const question of newQuestions) {
            newCards.push({
              userId: user.id,
              questionId: question.id,
            });
          }
        }
        await storage.bulkCreateReviewCards(newCards);
      }
      
      // For updated questions, recreate review cards for all users (fresh start)
      if (allUsers.length > 0 && updatedQuestions.length > 0) {
        const updatedCards = [];
        for (const user of allUsers) {
          for (const question of updatedQuestions) {
            updatedCards.push({
              userId: user.id,
              questionId: question.id,
            });
          }
        }
        await storage.bulkCreateReviewCards(updatedCards);
      }

      res.json({ 
        success: true, 
        created: newQuestions.length,
        updated: updatedQuestions.length,
        total: newQuestions.length + updatedQuestions.length
      });
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
      // Manually validate updates since .partial() doesn't work with .refine()
      const updates: any = {};
      
      if (req.body.question !== undefined) updates.question = req.body.question;
      if (req.body.questionType !== undefined) updates.questionType = req.body.questionType;
      if (req.body.options !== undefined) updates.options = req.body.options;
      if (req.body.correctAnswer !== undefined) updates.correctAnswer = req.body.correctAnswer;
      if (req.body.correctAnswers !== undefined) updates.correctAnswers = req.body.correctAnswers;
      if (req.body.category !== undefined) updates.category = req.body.category;
      if (req.body.curriculum !== undefined) updates.curriculum = req.body.curriculum;
      
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

  // Delete all questions (admin only)
  app.delete("/api/questions", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const result = await storage.deleteAllQuestions();
      res.json({ success: true, count: result.count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all available curricula
  app.get("/api/curricula", isAuthenticated, async (req, res) => {
    try {
      const curricula = await storage.getAllCurricula();
      res.json(curricula);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get due questions for quiz (user-specific)
  app.get("/api/quiz/due", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Parse curricula parameter (can be comma-separated string or array)
      let curricula: string[] | undefined;
      if (req.query.curricula) {
        const curriculaParam = req.query.curricula as string;
        curricula = curriculaParam.split(',').map(c => c.trim()).filter(Boolean);
      }
      
      // Ensure user has review cards for all questions
      await storage.ensureUserReviewCards(userId);
      
      // Get due cards with questions in single optimized query
      const dueCardsWithQuestions = await storage.getDueCardsWithQuestions(userId, curricula);
      
      // Shuffle for variety
      const shuffled = dueCardsWithQuestions.sort(() => Math.random() - 0.5);
      
      // Map to QuizQuestion format
      const quizQuestions: QuizQuestion[] = shuffled.map((row) => ({
        id: row.questionId,
        question: row.question,
        questionType: (row.questionType || 'single') as 'single' | 'multi',
        options: row.options,
        category: row.category ?? undefined,
        curriculum: row.curriculum ?? undefined,
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
      const submission = answerSubmissionSchema.parse(req.body);
      const { questionId, selectedAnswer, selectedAnswers, textAnswer } = submission;
      
      // Ensure user has review cards for all questions
      await storage.ensureUserReviewCards(userId);
      
      // Get question to check correct answer
      const question = await storage.getQuestion(questionId);
      if (!question) {
        return res.status(404).json({ error: "Question not found" });
      }

      // Check if answer is correct based on question type
      let isCorrect = false;
      let correctAnswerData: number | number[] | string[];
      
      if (question.questionType === 'text-input') {
        // Text-input: case-insensitive fuzzy matching against accepted answers
        const normalizedInput = (textAnswer || '').trim().toLowerCase();
        const acceptedAnswers = question.options || [];
        isCorrect = acceptedAnswers.some(accepted => 
          accepted.trim().toLowerCase() === normalizedInput
        );
        correctAnswerData = acceptedAnswers;
      } else if (question.questionType === 'multi') {
        // Multi-select: check if selected set exactly matches correct set
        const selected = new Set(selectedAnswers || []);
        const correct = new Set(question.correctAnswers || []);
        isCorrect = selected.size === correct.size && 
                   Array.from(selected).every(ans => correct.has(ans));
        correctAnswerData = question.correctAnswers || [];
      } else {
        // Single-choice: check if selected answer matches
        isCorrect = selectedAnswer === question.correctAnswer;
        correctAnswerData = question.correctAnswer || 0;
      }
      
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
        correctAnswer: correctAnswerData,
        questionType: question.questionType,
        nextReviewDate: sm2Result.nextReviewDate,
        interval: sm2Result.interval,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get statistics (user-specific, respects curriculum preferences)
  app.get("/api/statistics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Ensure user has review cards for all questions
      await storage.ensureUserReviewCards(userId);
      
      // Get user's curriculum preferences
      const user = await storage.getUser(userId);
      const curricula = user?.selectedCurricula || undefined;
      
      const stats = await storage.getStatistics(userId, curricula);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get review cards with questions for progress details (respects curriculum preferences)
  app.get("/api/progress/cards", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Ensure user has review cards for all questions
      await storage.ensureUserReviewCards(userId);
      
      // Get user's curriculum preferences
      const user = await storage.getUser(userId);
      const curricula = user?.selectedCurricula || undefined;
      
      const allCards = await storage.getReviewCardsWithQuestions(userId);
      
      // Filter by curricula if user has preferences
      const filteredCards = curricula && curricula.length > 0
        ? allCards.filter(card => card.curriculum && curricula.includes(card.curriculum))
        : allCards;
      
      res.json(filteredCards);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
