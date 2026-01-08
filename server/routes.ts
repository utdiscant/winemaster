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
import { setupAuth, isAuthenticated, isAdmin } from "./auth";
import type { User } from "@shared/schema";
import { z } from "zod";
import { isPointInPolygon } from "./utils/geoUtils";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  await setupAuth(app);

  // Auth routes
  // Public session endpoint - doesn't require auth, returns user if logged in or null
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.id) {
        return res.json(null);
      }

      const userId = (req.user as User).id;
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
      const userId = (req.user as User).id;
      
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
      const currentUserId = (req.user as User).id;
      
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
      // Log request body for debugging
      console.log("Upload request body:", JSON.stringify(req.body).substring(0, 200));
      
      let validatedData;
      try {
        validatedData = jsonUploadSchema.parse(req.body);
      } catch (validationError: any) {
        console.error("Validation error details:", validationError);
        throw validationError;
      }
      
      let newQuestions = [];
      let updatedQuestions = [];
      
      // Process each question: upsert if ID provided, create if not
      for (const q of validatedData.questions) {
        try {
          console.log("Processing question:", q.id || "no-id-yet", "type:", q.type);
          let questionData: any;
        
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
          } else if (q.type === 'map') {
            questionData = {
              id: q.id,
              question: q.question,
              questionType: 'map' as const,
              regionName: q.regionName,
              regionPolygon: q.regionPolygon,
              options: q.acceptedAnswers, // Store accepted answers in options field for map-to-text mode
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
        } catch (questionError: any) {
          console.error(`Error processing question ID "${q.id || 'no-id-yet'}":`, questionError);
          throw new Error(`Question "${q.id || 'new question'}" failed: ${questionError.message}`);
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
      console.error("Upload error:", error);
      // If it's a Zod validation error, provide detailed info
      if (error.issues) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: error.issues.map((issue: any) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code
          }))
        });
      }
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
      const userId = (req.user as User).id;
      
      // Parse curricula parameter (can be comma-separated string or array)
      let curricula: string[] | undefined;
      if (req.query.curricula) {
        const curriculaParam = req.query.curricula as string;
        curricula = curriculaParam.split(',').map(c => c.trim()).filter(Boolean);
      }
      
      // Get count of reviews completed today for daily progress tracking
      const completedToday = await storage.getReviewsCompletedToday(userId, curricula);
      
      // Get due cards with questions in single optimized query
      // Questions are sorted by nextReviewDate (earliest first = highest priority)
      // Note: ensureUserReviewCards is called on login/initial load, not on every quiz fetch
      const dueCardsWithQuestions = await storage.getDueCardsWithQuestions(userId, curricula);
      
      // Shuffle for variety while preserving general priority
      // This gives variety within the due set without completely randomizing priority
      const shuffled = dueCardsWithQuestions.sort(() => Math.random() - 0.5);
      
      // Map to QuizQuestion format
      const quizQuestions: QuizQuestion[] = shuffled.map((row) => ({
        id: row.questionId,
        question: row.question,
        questionType: (row.questionType || 'single') as 'single' | 'multi' | 'text-input' | 'map',
        options: row.options,
        category: row.category ?? undefined,
        curriculum: row.curriculum ?? undefined,
        reviewCardId: row.reviewCardId,
        regionPolygon: row.regionPolygon,
        regionName: row.regionName ?? undefined,
      }));

      // Return questions with daily progress metadata
      res.json({
        questions: quizQuestions,
        dailyProgress: {
          completedToday,
          dailyGoal: 20,
          totalDue: quizQuestions.length,
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Submit answer and update SM-2 (user-specific)
  app.post("/api/quiz/answer", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as User).id;
      const submission = answerSubmissionSchema.parse(req.body);
      const { questionId, selectedAnswer, selectedAnswers, textAnswer, mapClick, displayMode } = submission;
      
      // Get question and review card in a single optimized query
      let questionAndCard = await storage.getQuestionWithReviewCard(userId, questionId);
      
      // Fallback: If review card doesn't exist, create it and retry
      if (!questionAndCard) {
        await storage.ensureUserReviewCards(userId);
        questionAndCard = await storage.getQuestionWithReviewCard(userId, questionId);
        
        if (!questionAndCard) {
          return res.status(404).json({ error: "Question or review card not found" });
        }
      }
      
      const question = {
        id: questionAndCard.questionId,
        question: questionAndCard.question,
        questionType: questionAndCard.questionType,
        options: questionAndCard.options,
        correctAnswer: questionAndCard.correctAnswer,
        correctAnswers: questionAndCard.correctAnswers,
        regionPolygon: questionAndCard.regionPolygon,
        regionName: questionAndCard.regionName,
      };
      
      const reviewCard = {
        id: questionAndCard.reviewCardId,
        easeFactor: questionAndCard.easeFactor,
        interval: questionAndCard.interval,
        repetitions: questionAndCard.repetitions,
      };

      // Check if answer is correct based on question type
      let isCorrect = false;
      let correctAnswerData: number | number[] | string[] | { regionName?: string; regionPolygon?: any };
      
      if (question.questionType === 'text-input') {
        // Text-input: case-insensitive fuzzy matching against accepted answers
        const normalizedInput = (textAnswer || '').trim().toLowerCase();
        const acceptedAnswers = question.options || [];
        isCorrect = acceptedAnswers.some((accepted: string) => 
          accepted.trim().toLowerCase() === normalizedInput
        );
        correctAnswerData = acceptedAnswers;
      } else if (question.questionType === 'map') {
        // Map question: check based on displayMode
        if (displayMode === 'text-to-map') {
          // Text-to-map mode: check if clicked point is inside the region polygon
          if (mapClick && question.regionPolygon) {
            isCorrect = isPointInPolygon(mapClick, question.regionPolygon);
          }
        } else if (displayMode === 'map-to-text') {
          // Map-to-text mode: check if text answer matches any accepted answer (stored in options)
          const normalizedInput = (textAnswer || '').trim().toLowerCase();
          const acceptedAnswers = question.options || [];
          isCorrect = acceptedAnswers.some((accepted: string) => 
            accepted.trim().toLowerCase() === normalizedInput
          );
        }
        correctAnswerData = {
          regionName: question.regionName || undefined,
          regionPolygon: question.regionPolygon,
        };
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
      const userId = (req.user as User).id;
      
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
      const userId = (req.user as User).id;
      
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

  // ===== Blind Tasting Endpoints =====
  
  // Start a new blind tasting session
  app.post("/api/blind-tasting/start", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as User)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check if there's already an active session and delete it to ensure a fresh start
      const existingSession = await storage.getCurrentBlindTastingSession(userId);
      if (existingSession) {
        await storage.deleteBlindTastingSession(existingSession.id);
      }

      // Get all tasting notes
      const allWines = await storage.getAllTastingNotes();
      if (allWines.length === 0) {
        return res.status(500).json({ error: "No tasting notes available" });
      }

      // Randomly select a target wine
      const randomIndex = Math.floor(Math.random() * allWines.length);
      const targetWine = allWines[randomIndex];

      // Create new session
      const session = await storage.createBlindTastingSession(userId, targetWine.id);

      res.json({
        session,
        targetWine,
        allWines,
      });
    } catch (error) {
      console.error("Error starting blind tasting:", error);
      res.status(500).json({ error: "Failed to start blind tasting session" });
    }
  });

  // Get current blind tasting session
  app.get("/api/blind-tasting/current", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as User)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const session = await storage.getCurrentBlindTastingSession(userId);
      if (!session) {
        return res.json({ session: null });
      }

      const targetWine = await storage.getTastingNote(session.targetWineId);
      const allWines = await storage.getAllTastingNotes();

      res.json({
        session,
        targetWine,
        allWines,
      });
    } catch (error) {
      console.error("Error getting current blind tasting:", error);
      res.status(500).json({ error: "Failed to get current session" });
    }
  });

  // Toggle wine elimination (eliminate or un-eliminate)
  app.post("/api/blind-tasting/toggle-eliminate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as User)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { wineId, eliminate } = req.body;
      if (!wineId || typeof eliminate !== 'boolean') {
        return res.status(400).json({ error: "Wine ID and eliminate boolean are required" });
      }

      const session = await storage.getCurrentBlindTastingSession(userId);
      if (!session) {
        return res.status(404).json({ error: "No active session found" });
      }

      const wine = await storage.getTastingNote(wineId);
      if (!wine) {
        return res.status(404).json({ error: "Wine not found" });
      }

      let updatedSession;
      if (eliminate) {
        updatedSession = await storage.eliminateWine(session.id, wineId);
      } else {
        updatedSession = await storage.unEliminateWine(session.id, wineId);
      }

      res.json({
        success: true,
        session: updatedSession,
        action: eliminate ? "eliminated" : "restored",
        wine: `${wine.grape} from ${wine.region}`,
      });
    } catch (error) {
      console.error("Error toggling wine elimination:", error);
      res.status(500).json({ error: "Failed to toggle wine elimination" });
    }
  });

  // Advance to next clue
  app.post("/api/blind-tasting/advance", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as User)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const session = await storage.getCurrentBlindTastingSession(userId);
      if (!session) {
        return res.status(404).json({ error: "No active session found" });
      }

      if (session.currentClueStage >= 2) {
        return res.status(400).json({ error: "Already at final clue" });
      }

      const updatedSession = await storage.advanceClue(session.id);
      res.json({ session: updatedSession });
    } catch (error) {
      console.error("Error advancing clue:", error);
      res.status(500).json({ error: "Failed to advance clue" });
    }
  });

  // Complete blind tasting session
  app.post("/api/blind-tasting/complete", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as User)?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const session = await storage.getCurrentBlindTastingSession(userId);
      if (!session) {
        return res.status(404).json({ error: "No active session found" });
      }

      // Validate completion by checking eliminated wines
      const eliminatedWines = session.eliminatedWines || [];
      
      // First, ensure target wine was not eliminated
      if (eliminatedWines.includes(session.targetWineId)) {
        const correctWine = await storage.getTastingNote(session.targetWineId);
        return res.status(400).json({ 
          error: `Incorrect! You eliminated the target wine: ${correctWine?.grape} from ${correctWine?.region}`,
          correctWine
        });
      }

      // Get all wines to count remaining
      const allWines = await storage.getAllTastingNotes();
      const remainingCount = allWines.length - eliminatedWines.length;

      // Validate that exactly one wine remains
      if (remainingCount !== 1) {
        return res.status(400).json({ 
          error: `Cannot complete: You must eliminate all wines except the target. ${remainingCount} wines remaining.`,
          remainingCount
        });
      }

      // If we get here, exactly one wine remains and it's not in the eliminated list,
      // which means it must be the target wine (since target is not eliminated)

      const updatedSession = await storage.completeBlindTastingSession(session.id);
      res.json({ session: updatedSession });
    } catch (error) {
      console.error("Error completing blind tasting:", error);
      res.status(500).json({ error: "Failed to complete session" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
