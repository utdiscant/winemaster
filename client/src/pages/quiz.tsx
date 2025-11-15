import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Wine } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { QuizQuestion, User } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import MapQuestion from "@/components/MapQuestion";

export default function QuizPage() {
  const { toast } = useToast();
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null); // For single-choice
  const [selectedAnswers, setSelectedAnswers] = useState<Set<number>>(new Set()); // For multi-select
  const [textAnswer, setTextAnswer] = useState<string>(""); // For map questions
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [shuffledOptions, setShuffledOptions] = useState<{ text: string; originalIndex: number }[]>([]);
  const [correctAnswerIndexes, setCorrectAnswerIndexes] = useState<Set<number>>(new Set()); // Changed to Set for multi-select
  const [correctAnswerText, setCorrectAnswerText] = useState<string>(""); // For map questions
  const [sessionStartCount, setSessionStartCount] = useState<number | null>(null);
  const [answeredInSession, setAnsweredInSession] = useState(0);
  const [isAdvancing, setIsAdvancing] = useState(false);

  // Fetch user to get curriculum preferences
  const { data: user, isLoading: isLoadingUser } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
  });

  // Build query URL based on user's selected curricula
  const buildQuizQueryUrl = () => {
    const selectedCurricula = user?.selectedCurricula || [];
    if (selectedCurricula.length === 0) {
      return "/api/quiz/due";
    }
    return `/api/quiz/due?curricula=${selectedCurricula.map(c => encodeURIComponent(c)).join(',')}`;
  };

  const { data: dueQuestions, isLoading: isLoadingQuestions, isFetching, refetch, isError } = useQuery<QuizQuestion[]>({
    queryKey: ["/api/quiz/due", { curricula: user?.selectedCurricula || [] }],
    queryFn: async () => {
      const response = await fetch(buildQuizQueryUrl(), { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch quiz questions");
      return response.json();
    },
    enabled: !isLoadingUser, // Enable once we know auth status, even if user is null
    refetchOnMount: 'always', // Always refetch when component mounts to avoid stale cache
    staleTime: 0, // Consider data stale immediately to ensure fresh data
  });

  const isLoading = isLoadingUser || isLoadingQuestions;

  // Initialize session count on first load
  useEffect(() => {
    if (dueQuestions && dueQuestions.length > 0 && sessionStartCount === null && !isAdvancing) {
      setSessionStartCount(dueQuestions.length);
    }
  }, [dueQuestions, sessionStartCount, isAdvancing]);

  // Handle advancing to next question
  useEffect(() => {
    if (isAdvancing && !isFetching) {
      const wasLastQuestion = !dueQuestions || dueQuestions.length === 0;
      
      if (wasLastQuestion) {
        // Session complete
        const completedCount = sessionStartCount ?? answeredInSession + 1;
        toast({
          title: "Session Complete!",
          description: `You've completed ${completedCount} ${completedCount === 1 ? 'question' : 'questions'}. Great work!`,
        });
        setSessionStartCount(null);
        setAnsweredInSession(0);
      } else {
        // More questions available
        setAnsweredInSession(prev => prev + 1);
      }
      
      setIsAdvancing(false);
    }
  }, [isAdvancing, isFetching, dueQuestions, sessionStartCount, answeredInSession, toast]);

  // Handle fetch errors
  useEffect(() => {
    if (isError && isAdvancing) {
      toast({
        title: "Error",
        description: "Failed to load next question. Please try again.",
        variant: "destructive",
      });
      setIsAdvancing(false);
    }
  }, [isError, isAdvancing, toast]);

  const submitAnswerMutation = useMutation({
    mutationFn: async (data: { questionId: string; selectedAnswer?: number; selectedAnswers?: number[]; textAnswer?: string }) => {
      return await apiRequest("POST", "/api/quiz/answer", data);
    },
    onSuccess: (response) => {
      if (currentQuestion?.questionType === 'map') {
        // Map question: store the correct text answer
        setCorrectAnswerText(response.correctAnswer);
      } else {
        // Find the shuffled indexes of the correct answer(s)
        const correctAnswers = Array.isArray(response.correctAnswer) ? response.correctAnswer : [response.correctAnswer];
        const correctShuffledIndexes = new Set<number>(
          correctAnswers.map((origIndex: number) =>
            shuffledOptions.findIndex(opt => opt.originalIndex === origIndex)
          )
        );
        setCorrectAnswerIndexes(correctShuffledIndexes);
      }
      setIsCorrect(response.correct);
      setIsAnswered(true);
      
      // Only invalidate statistics, NOT the due questions query
      // We'll invalidate due questions when user clicks "Next Question"
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Always show the first question in the list (backend removes answered ones)
  const currentQuestion = dueQuestions?.[0];

  // Shuffle options when question changes
  useEffect(() => {
    if (currentQuestion) {
      // Only shuffle if not a map question
      if (currentQuestion.questionType !== 'map' && currentQuestion.options) {
        const options = currentQuestion.options.map((text, index) => ({
          text,
          originalIndex: index,
        }));
        
        // Fisher-Yates shuffle
        for (let i = options.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [options[i], options[j]] = [options[j], options[i]];
        }
        
        setShuffledOptions(options);
      }
      
      // Reset all answer states
      setSelectedAnswer(null);
      setSelectedAnswers(new Set());
      setTextAnswer("");
      setCorrectAnswerText("");
      setCorrectAnswerIndexes(new Set());
      setIsAnswered(false);
    }
  }, [currentQuestion]);

  const handleAnswerSelect = (index: number) => {
    if (!isAnswered) {
      if (currentQuestion?.questionType === 'multi') {
        // Multi-select: toggle selection
        setSelectedAnswers(prev => {
          const newSet = new Set(prev);
          if (newSet.has(index)) {
            newSet.delete(index);
          } else {
            newSet.add(index);
          }
          return newSet;
        });
      } else {
        // Single-choice: replace selection
        setSelectedAnswer(index);
      }
    }
  };

  const handleSubmitAnswer = () => {
    if (!currentQuestion) return;

    const isMulti = currentQuestion.questionType === 'multi';
    const isMap = currentQuestion.questionType === 'map';
    
    if (isMap) {
      // Map question: submit text answer
      if (!textAnswer.trim()) return;
      
      submitAnswerMutation.mutate({
        questionId: currentQuestion.id,
        textAnswer: textAnswer.trim(),
      });
    } else if (isMulti) {
      // Multi-select: need at least zero selections (empty is allowed)
      const originalIndexes = Array.from(selectedAnswers).map(i => shuffledOptions[i].originalIndex);
      
      submitAnswerMutation.mutate({
        questionId: currentQuestion.id,
        selectedAnswers: originalIndexes,
      });
    } else {
      // Single-choice: need exactly one selection
      if (selectedAnswer === null) return;
      const originalAnswerIndex = shuffledOptions[selectedAnswer].originalIndex;

      submitAnswerMutation.mutate({
        questionId: currentQuestion.id,
        selectedAnswer: originalAnswerIndex,
      });
    }
  };

  const handleNextQuestion = async () => {
    // Reset answer state immediately to prevent double-clicking
    setIsAnswered(false);
    setSelectedAnswer(null);
    setSelectedAnswers(new Set());
    setTextAnswer("");
    setCorrectAnswerText("");
    setCorrectAnswerIndexes(new Set());
    setIsAdvancing(true);
    
    // Refetch to get next question (answered one is removed by backend)
    await refetch();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Wine className="w-12 h-12 text-primary mx-auto animate-pulse" />
          <p className="text-muted-foreground">Loading your quiz...</p>
        </div>
      </div>
    );
  }

  if (!dueQuestions || dueQuestions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <Wine className="w-16 h-16 text-primary mx-auto" />
            <h2 className="text-2xl font-serif font-semibold">No Questions Due</h2>
            <p className="text-muted-foreground">
              Great work! You're all caught up. Check back later for more reviews, or upload new questions to continue learning.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentQuestion) {
    return null; // Should never happen due to earlier checks, but keeps TypeScript happy
  }

  const currentQuestionNumber = answeredInSession + 1;
  const totalQuestions = sessionStartCount ?? (dueQuestions?.length ?? 1);
  // Progress based on answered questions (not including current unanswered question)
  const answeredQuestions = isAnswered ? answeredInSession + 1 : answeredInSession;
  const progressPercentage = totalQuestions > 0 ? (answeredQuestions / totalQuestions) * 100 : 0;

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Question {currentQuestionNumber} of {totalQuestions}
            </span>
            <span className="font-medium">
              {Math.round(progressPercentage)}% Complete
            </span>
          </div>
          <Progress value={progressPercentage} className="h-2" data-testid="progress-quiz" />
        </div>

        {/* Question Card */}
        <Card className="border-card-border">
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="shrink-0" data-testid="badge-question-number">
                  #{currentQuestionNumber}
                </Badge>
                <Badge 
                  variant={currentQuestion.questionType === 'multi' ? 'default' : 'outline'}
                  className="shrink-0"
                  data-testid="badge-question-type"
                >
                  {currentQuestion.questionType === 'multi' 
                    ? 'Multi-Select' 
                    : currentQuestion.questionType === 'map' 
                    ? 'Map Question' 
                    : 'Single Choice'}
                </Badge>
              </div>
              {currentQuestion.category && (
                <Badge variant="outline" className="shrink-0" data-testid="badge-category">
                  {currentQuestion.category}
                </Badge>
              )}
            </div>
            {currentQuestion.questionType === 'multi' && !isAnswered && (
              <p className="text-sm text-muted-foreground">
                Select all correct answers (there may be multiple)
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            <h2 className="text-2xl md:text-3xl font-medium leading-relaxed" data-testid="text-question">
              {currentQuestion.question}
            </h2>

            {/* Map Question or Regular Answer Options */}
            {currentQuestion.questionType === 'map' ? (
              <MapQuestion
                question={currentQuestion}
                isAnswered={isAnswered}
                isCorrect={isCorrect}
                correctAnswer={correctAnswerText}
                textAnswer={textAnswer}
                onTextAnswerChange={setTextAnswer}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {shuffledOptions.map((option, index) => {
                const isMulti = currentQuestion.questionType === 'multi';
                const isSelected = isMulti ? selectedAnswers.has(index) : selectedAnswer === index;
                const isCorrectAnswer = correctAnswerIndexes.has(index);
                const showAsCorrect = isAnswered && isCorrectAnswer;
                const showAsIncorrect = isAnswered && isSelected && !isCorrectAnswer;

                return (
                  <button
                    key={index}
                    onClick={() => handleAnswerSelect(index)}
                    disabled={isAnswered}
                    data-testid={`button-answer-${index}`}
                    className={`
                      relative p-4 rounded-lg border-2 text-left transition-all
                      ${isSelected && !isAnswered ? "border-primary bg-primary/5" : "border-border"}
                      ${showAsCorrect ? "border-green-600 bg-green-50 dark:bg-green-950/40 border-[3px]" : ""}
                      ${showAsIncorrect ? "border-destructive bg-destructive/10 border-[3px]" : ""}
                      ${!isAnswered ? "hover-elevate active-elevate-2 cursor-pointer" : "cursor-default"}
                      disabled:opacity-100
                    `}
                  >
                    <div className="flex items-start gap-3">
                      {isMulti ? (
                        // Checkbox for multi-select
                        <div
                          className={`
                            flex items-center justify-center w-6 h-6 rounded border-2 shrink-0
                            ${isSelected && !isAnswered ? "bg-primary border-primary" : "border-muted-foreground"}
                            ${showAsCorrect ? "bg-green-600 border-green-600" : ""}
                            ${showAsIncorrect ? "bg-destructive border-destructive" : ""}
                          `}
                        >
                          {isSelected && !isAnswered && (
                            <CheckCircle2 className="w-4 h-4 text-primary-foreground" />
                          )}
                          {showAsCorrect && (
                            <CheckCircle2 className="w-4 h-4 text-white" />
                          )}
                          {showAsIncorrect && (
                            <XCircle className="w-4 h-4 text-destructive-foreground" />
                          )}
                        </div>
                      ) : (
                        // Radio button for single-choice
                        <span
                          className={`
                            flex items-center justify-center w-8 h-8 rounded-full shrink-0 font-semibold text-sm
                            ${isSelected && !isAnswered ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}
                            ${showAsCorrect ? "bg-green-600 text-white" : ""}
                            ${showAsIncorrect ? "bg-destructive text-destructive-foreground" : ""}
                          `}
                        >
                          {String.fromCharCode(65 + index)}
                        </span>
                      )}
                      <span className={`flex-1 pt-1 ${showAsCorrect ? "font-medium" : ""}`}>
                        {option.text}
                      </span>
                      {showAsCorrect && <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />}
                      {showAsIncorrect && <XCircle className="w-6 h-6 text-destructive shrink-0" />}
                    </div>
                    {showAsCorrect && (
                      <div className="mt-2 pt-2 border-t border-green-600/20">
                        <span className="text-sm font-medium text-green-700 dark:text-green-400">
                          ✓ Correct Answer
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4">
              {!isAnswered ? (
                <Button
                  onClick={handleSubmitAnswer}
                  disabled={
                    (currentQuestion.questionType === 'single' && selectedAnswer === null) || 
                    (currentQuestion.questionType === 'map' && !textAnswer.trim()) || 
                    submitAnswerMutation.isPending
                  }
                  size="lg"
                  data-testid="button-submit-answer"
                >
                  {submitAnswerMutation.isPending ? "Submitting..." : "Submit Answer"}
                </Button>
              ) : (
                <Button
                  onClick={handleNextQuestion}
                  size="lg"
                  disabled={isAdvancing}
                  data-testid="button-next-question"
                >
                  {isAdvancing ? "Loading..." : ((dueQuestions?.length ?? 0) > 1 ? "Next Question" : "Finish Session")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Feedback Message */}
        {isAnswered && (
          <Card className={`border-2 ${isCorrect ? "border-green-600 bg-green-50 dark:bg-green-950/40" : "border-amber-600 bg-amber-50 dark:bg-amber-950/40"}`}>
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {isCorrect ? (
                    <CheckCircle2 className="w-7 h-7 text-green-600 shrink-0" />
                  ) : (
                    <XCircle className="w-7 h-7 text-amber-600 shrink-0" />
                  )}
                  <div>
                    <p className="font-semibold text-lg">
                      {isCorrect ? "Correct!" : "Incorrect"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {isCorrect
                        ? "Great job! You got it right."
                        : currentQuestion.questionType === 'map'
                        ? "The correct answer is shown above."
                        : "The correct answer is highlighted in green above."}
                    </p>
                  </div>
                </div>
                {!isCorrect && (
                  <p className="text-sm text-muted-foreground pl-10">
                    This question will be reviewed again soon to help you master it.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
