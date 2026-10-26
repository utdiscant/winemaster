import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, Wine, BookCheck, BookOpen, HelpCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { CategorySummary, QuizQuestion, User } from "@shared/schema";
import { queryClient, apiRequest, apiUrl } from "@/lib/queryClient";
import WineMap from "@/components/WineMap";
import { getPolygonCentroid, getBoundsForPolygonAndPoint } from "@shared/geo";

interface QuizResponse {
  questions: QuizQuestion[];
  dailyProgress: {
    completedToday: number;
    dailyGoal: number;
    totalDue: number;
  };
}

// The Learn page, training only one category
export function trainCategoryPath(category: string): string {
  return `/?category=${encodeURIComponent(category)}`;
}

const ALL_CATEGORIES = "__all__";

// Picks which category to train. Lists the categories in the user's curricula with how many questions
// are due in each.
function CategoryPicker({ category, curricula }: { category?: string; curricula: string[] }) {
  const [, setLocation] = useLocation();
  const { data: categories } = useQuery<CategorySummary[]>({
    queryKey: ["/api/quiz/categories", { curricula }],
    queryFn: async () => {
      const params = curricula.length > 0 ? `?curricula=${curricula.map(encodeURIComponent).join(",")}` : "";
      const response = await fetch(apiUrl(`/api/quiz/categories${params}`), { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch categories");
      return response.json();
    },
    staleTime: 0,
  });
  if (!categories || categories.length === 0) return null;

  const totalDue = categories.reduce((sum, c) => sum + c.due, 0);
  return (
    <Select
      value={category ?? ALL_CATEGORIES}
      onValueChange={(value) => setLocation(value === ALL_CATEGORIES ? "/" : trainCategoryPath(value))}
    >
      <SelectTrigger className="w-full" data-testid="select-category">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_CATEGORIES}>All categories · {totalDue} due</SelectItem>
        {categories.map((c) => (
          <SelectItem key={c.category} value={c.category}>
            {c.category} · {c.due} due
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function QuizPage() {
  const category = new URLSearchParams(useSearch()).get("category") || undefined;
  // A new session (counts, current question) for each category
  return <QuizSession key={category ?? ALL_CATEGORIES} category={category} />;
}

function QuizSession({ category }: { category?: string }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null); // For single-choice
  const [selectedAnswers, setSelectedAnswers] = useState<Set<number>>(new Set()); // For multi-select
  const [textAnswer, setTextAnswer] = useState<string>(""); // For text-input and map (map-to-text mode)
  const [mapClick, setMapClick] = useState<{ lat: number; lng: number } | null>(null); // For map (text-to-map mode)
  const [mapDisplayMode, setMapDisplayMode] = useState<'text-to-map' | 'map-to-text' | null>(null); // For map questions: randomly chosen display mode
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [shuffledOptions, setShuffledOptions] = useState<{ text: string; originalIndex: number }[]>([]);
  const [correctAnswerIndexes, setCorrectAnswerIndexes] = useState<Set<number>>(new Set()); // Changed to Set for multi-select
  const [correctTextAnswers, setCorrectTextAnswers] = useState<string[]>([]); // For text-input correct answers
  const [correctMapData, setCorrectMapData] = useState<{ regionName?: string; regionPolygon?: any } | null>(null); // For map questions feedback
  const [sessionStartCount, setSessionStartCount] = useState<number | null>(null);
  const [answeredInSession, setAnsweredInSession] = useState(0);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null); // The theory behind the answer
  const [answeredDontKnow, setAnsweredDontKnow] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false); // After a correct answer, shown on request

  // Fetch user to get curriculum preferences
  const { data: user, isLoading: isLoadingUser } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
  });

  const selectedCurricula = user?.selectedCurricula || [];

  // Build query URL based on user's selected curricula and the category being trained
  const buildQuizQueryUrl = () => {
    const params = new URLSearchParams();
    if (selectedCurricula.length > 0) params.set("curricula", selectedCurricula.join(","));
    if (category) params.set("category", category);
    const query = params.toString();
    return query ? `/api/quiz/due?${query}` : "/api/quiz/due";
  };

  const { data: quizData, isLoading: isLoadingQuestions, isFetching, refetch, isError } = useQuery<QuizResponse>({
    queryKey: ["/api/quiz/due", { curricula: selectedCurricula, category }],
    queryFn: async () => {
      const response = await fetch(apiUrl(buildQuizQueryUrl()), { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch quiz questions");
      return response.json();
    },
    enabled: !isLoadingUser, // Enable once we know auth status, even if user is null
    refetchOnMount: 'always', // Always refetch when component mounts to avoid stale cache
    staleTime: 0, // Consider data stale immediately to ensure fresh data
  });

  const dueQuestions = quizData?.questions || [];
  const dailyProgress = quizData?.dailyProgress;

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
    mutationFn: async (data: { questionId: string; selectedAnswer?: number; selectedAnswers?: number[]; textAnswer?: string; mapClick?: { lat: number; lng: number }; displayMode?: 'text-to-map' | 'map-to-text'; dontKnow?: true }) => {
      return await apiRequest("POST", "/api/quiz/answer", data);
    },
    onSuccess: (response) => {
      if (currentQuestion?.questionType === 'text-input') {
        // For text-input, store the correct text answers
        setCorrectTextAnswers(response.correctAnswer || []);
      } else if (currentQuestion?.questionType === 'map') {
        // For map questions, store the correct region data
        setCorrectMapData(response.correctAnswer || null);
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
      setExplanation(response.explanation ?? null);
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

  // "I know this": the question won't come up for review again (undo from the Progress page)
  const markKnownMutation = useMutation({
    mutationFn: (questionId: string) => apiRequest("PUT", `/api/quiz/known/${questionId}`, { known: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      toast({
        title: "Marked as known",
        description: "You won't be asked this again. You can bring it back from the Progress page.",
      });
      handleNextQuestion();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Always show the first question in the list (backend removes answered ones)
  const currentQuestion = dueQuestions?.[0];

  // Calculate bounds for text-to-map questions to show both the user's pin and entire polygon
  const centerMarkerPos = useMemo(() => {
    if (isAnswered && correctMapData?.regionPolygon) {
      return getPolygonCentroid(correctMapData.regionPolygon);
    }
    return null;
  }, [isAnswered, correctMapData]);

  const textToMapBounds = useMemo(() => {
    // Include entire polygon plus user's click point in bounds
    // Only calculate when all data is available for current question
    if (isAnswered && mapClick && correctMapData?.regionPolygon && currentQuestion?.id) {
      return getBoundsForPolygonAndPoint(correctMapData.regionPolygon, mapClick);
    }
    return null;
  }, [isAnswered, mapClick, correctMapData, currentQuestion?.id]);

  // Shuffle options and randomly choose map display mode when question changes
  useEffect(() => {
    if (currentQuestion) {
      if (currentQuestion.questionType === 'text-input') {
        // No need to shuffle for text-input
        setShuffledOptions([]);
        setMapDisplayMode(null);
      } else if (currentQuestion.questionType === 'map') {
        // For map questions, randomly choose display mode
        setShuffledOptions([]);
        setMapDisplayMode(Math.random() < 0.5 ? 'text-to-map' : 'map-to-text');
      } else {
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
        setMapDisplayMode(null);
      }
      
      setSelectedAnswer(null);
      setSelectedAnswers(new Set());
      setTextAnswer("");
      setMapClick(null);
      setIsAnswered(false);
      setCorrectMapData(null);
      setExplanation(null);
      setAnsweredDontKnow(false);
      setShowExplanation(false);
    }
  }, [currentQuestion?.id]); // Key on question ID to reset when question changes

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

  // Reveal the answer and explanation; counts as not knowing it
  const handleDontKnow = () => {
    if (!currentQuestion) return;
    setAnsweredDontKnow(true);
    submitAnswerMutation.mutate({
      questionId: currentQuestion.id,
      dontKnow: true,
      ...(mapDisplayMode ? { displayMode: mapDisplayMode } : {}),
    });
  };

  const handleSubmitAnswer = () => {
    if (!currentQuestion) return;

    const isMulti = currentQuestion.questionType === 'multi';
    const isTextInput = currentQuestion.questionType === 'text-input';
    const isMap = currentQuestion.questionType === 'map';
    
    if (isTextInput) {
      // Text-input: submit the text answer
      submitAnswerMutation.mutate({
        questionId: currentQuestion.id,
        textAnswer: textAnswer,
      });
    } else if (isMap && mapDisplayMode === 'text-to-map') {
      // Map (text-to-map mode): submit the map click
      if (!mapClick) return;
      submitAnswerMutation.mutate({
        questionId: currentQuestion.id,
        mapClick: mapClick,
        displayMode: 'text-to-map',
      });
    } else if (isMap && mapDisplayMode === 'map-to-text') {
      // Map (map-to-text mode): submit the text answer
      submitAnswerMutation.mutate({
        questionId: currentQuestion.id,
        textAnswer: textAnswer,
        displayMode: 'map-to-text',
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
    setMapClick(null);
    setCorrectMapData(null);
    setExplanation(null);
    setAnsweredDontKnow(false);
    setShowExplanation(false);
    setIsAdvancing(true);
    queryClient.invalidateQueries({ queryKey: ["/api/quiz/categories"], exact: false });
    
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

  // A failed load must not look like "nothing due"
  if (isError && !quizData) {
    return (
      <div className="min-h-screen bg-background py-4 px-4">
        <div className="max-w-md mx-auto space-y-4">
          <CategoryPicker category={category} curricula={selectedCurricula} />
          <Card>
            <CardContent className="pt-6 text-center space-y-4">
              <XCircle className="w-12 h-12 text-destructive mx-auto" />
              <h2 className="text-2xl font-serif font-semibold">Couldn't load questions</h2>
              <p className="text-muted-foreground">Check your connection and try again.</p>
              <Button onClick={() => refetch()} disabled={isFetching} data-testid="button-retry">
                {isFetching ? "Loading..." : "Try again"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!dueQuestions || dueQuestions.length === 0) {
    return (
      <div className="min-h-screen bg-background py-4 px-4">
        <div className="max-w-md mx-auto space-y-4">
          <CategoryPicker category={category} curricula={selectedCurricula} />
          <Card>
            <CardContent className="pt-6 text-center space-y-4">
              <Wine className="w-16 h-16 text-primary mx-auto" />
              <h2 className="text-2xl font-serif font-semibold">No Questions Due</h2>
              <p className="text-muted-foreground">
                {category
                  ? `You're all caught up in ${category}. Pick another category, or train all of them.`
                  : "Great work! You're all caught up. Check back later for more reviews, or upload new questions to continue learning."}
              </p>
              {category && (
                <Button variant="outline" onClick={() => setLocation("/")} data-testid="button-train-all">
                  Train all categories
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
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

  // Calculate daily goal progress
  const dailyGoalMet = dailyProgress && dailyProgress.completedToday >= dailyProgress.dailyGoal;
  const dailyProgressPercentage = dailyProgress 
    ? Math.min((dailyProgress.completedToday / dailyProgress.dailyGoal) * 100, 100) 
    : 0;

  return (
    <div className="min-h-screen bg-background py-4 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <CategoryPicker category={category} curricula={selectedCurricula} />

        {/* Daily Goal Progress */}
        {dailyProgress && (
          <Card className={`${dailyGoalMet ? 'border-green-600 bg-green-50 dark:bg-green-950/40' : ''}`}>
            <CardContent className="py-3 px-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs md:text-sm">
                  <span className={`font-medium ${dailyGoalMet ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
                    Daily Goal: {dailyProgress.completedToday} / {dailyProgress.dailyGoal}
                  </span>
                  {dailyGoalMet ? (
                    <Badge variant="default" className="bg-green-600 hover:bg-green-700" data-testid="badge-daily-goal-met">
                      ✓ Goal Complete!
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {dailyProgress.dailyGoal - dailyProgress.completedToday} remaining
                    </span>
                  )}
                </div>
                <Progress 
                  value={dailyProgressPercentage} 
                  className="h-1.5" 
                  data-testid="progress-daily-goal" 
                />
                {dailyGoalMet && (
                  <p className="text-xs text-green-700 dark:text-green-400">
                    Amazing work! You've completed your daily goal. Feel free to continue practicing with the remaining {dailyProgress.totalDue - dailyProgress.completedToday} due questions.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}


        {/* Question Card */}
        <Card className="border-card-border">
          <CardHeader className="space-y-2 md:space-y-3 py-2 md:py-4">
            {currentQuestion.questionType === 'multi' && !isAnswered && (
              <p className="text-xs md:text-sm text-muted-foreground">
                Select all correct answers (there may be multiple)
              </p>
            )}
            {currentQuestion.questionType === 'text-input' && !isAnswered && (
              <p className="text-xs md:text-sm text-muted-foreground">
                Type your answer below (not case-sensitive)
              </p>
            )}
            {currentQuestion.questionType === 'map' && mapDisplayMode === 'text-to-map' && !isAnswered && (
              <p className="text-xs md:text-sm text-muted-foreground">
                Click on the map to identify the wine region
              </p>
            )}
            {currentQuestion.questionType === 'map' && mapDisplayMode === 'map-to-text' && !isAnswered && (
              <p className="text-xs md:text-sm text-muted-foreground">
                Name the highlighted wine region (not case-sensitive)
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-2 md:space-y-4 py-2 md:py-3 px-4 md:px-6">
            <h2 className="text-base md:text-2xl font-medium leading-relaxed" data-testid="text-question">
              {currentQuestion.questionType === 'map' && mapDisplayMode === 'map-to-text' 
                ? `What wine region is highlighted on the map?`
                : currentQuestion.question
              }
            </h2>

            {/* Text Input for text-input questions */}
            {currentQuestion.questionType === 'text-input' ? (
              <div className="space-y-2 md:space-y-4">
                <Input
                  type="text"
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  placeholder="Type your answer here..."
                  disabled={isAnswered}
                  className="text-sm md:text-base"
                  data-testid="input-text-answer"
                />
                {isAnswered && (
                  <div className="p-4 rounded-lg border-2 border-green-600 bg-green-50 dark:bg-green-950/40">
                    <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-2">
                      Accepted answers:
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      {correctTextAnswers.map((answer, idx) => (
                        <li key={idx} className="text-sm" data-testid={`text-correct-answer-${idx}`}>
                          {answer}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : currentQuestion.questionType === 'map' && mapDisplayMode === 'text-to-map' ? (
              /* Map (text-to-map mode): Show map and let user click */
              <div className="space-y-2 md:space-y-4">
                <WineMap
                  key={currentQuestion.id}
                  onMapClick={(lat, lng) => {
                    if (!isAnswered) {
                      setMapClick({ lat, lng });
                    }
                  }}
                  clickedLocation={mapClick}
                  showCorrectRegion={isAnswered}
                  correctRegionPolygon={correctMapData?.regionPolygon}
                  centerMarker={centerMarkerPos}
                  fitBounds={textToMapBounds}
                  data-testid="map-text-to-map"
                />
                {mapClick && !isAnswered && (
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Selected location: {mapClick.lat.toFixed(4)}, {mapClick.lng.toFixed(4)}
                  </p>
                )}
                {isAnswered && correctMapData?.regionName && (
                  <div className={`p-4 rounded-lg border-2 ${
                    isCorrect 
                      ? 'border-green-600 bg-green-50 dark:bg-green-950/40' 
                      : 'border-green-600 bg-green-50 dark:bg-green-950/40'
                  }`}>
                    <p className={`text-sm font-medium ${
                      isCorrect 
                        ? 'text-green-700 dark:text-green-400' 
                        : 'text-green-700 dark:text-green-400'
                    }`}>
                      Correct region: {correctMapData.regionName}
                    </p>
                  </div>
                )}
              </div>
            ) : currentQuestion.questionType === 'map' && mapDisplayMode === 'map-to-text' ? (
              /* Map (map-to-text mode): Show map with region, let user type name */
              <div className="space-y-2 md:space-y-4">
                <WineMap
                  key={currentQuestion.id}
                  regionPolygon={currentQuestion.regionPolygon}
                  data-testid="map-map-to-text"
                />
                <Input
                  type="text"
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  placeholder="Type the region name..."
                  disabled={isAnswered}
                  className="text-sm md:text-base"
                  data-testid="input-map-to-text-answer"
                />
                {isAnswered && !isCorrect && correctMapData && (
                  <div className="p-4 rounded-lg border-2 border-green-600 bg-green-50 dark:bg-green-950/40">
                    <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-2">
                      Correct answers:
                    </p>
                    {correctMapData.regionName && (
                      <p className="text-sm">Primary: {correctMapData.regionName}</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
              {shuffledOptions.map((option, index) => {
                const isMulti = currentQuestion.questionType === 'multi';
                const isSelected = isMulti ? selectedAnswers.has(index) : selectedAnswer === index;
                const isCorrectAnswer = correctAnswerIndexes.has(index);
                const showAsCorrect = isAnswered && isCorrectAnswer;
                const showAsIncorrect = isAnswered && isSelected && !isCorrectAnswer;
                const showAsMissed = isAnswered && isMulti && isCorrectAnswer && !isSelected && !answeredDontKnow;

                return (
                  <button
                    key={index}
                    onClick={() => handleAnswerSelect(index)}
                    disabled={isAnswered}
                    data-testid={`button-answer-${index}`}
                    className={`
                      relative p-2 md:p-3 rounded-lg border-2 text-left transition-all
                      ${isSelected && !isAnswered ? "border-primary bg-primary/5" : "border-border"}
                      ${showAsCorrect ? "border-green-600 bg-green-50 dark:bg-green-950/40 border-[3px]" : ""}
                      ${showAsIncorrect ? "border-destructive bg-destructive/10 border-[3px]" : ""}
                      ${showAsMissed ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 border-[3px]" : ""}
                      ${!isAnswered ? "hover-elevate active-elevate-2 cursor-pointer" : "cursor-default"}
                      disabled:opacity-100
                    `}
                  >
                    <div className="flex items-start gap-1 md:gap-2">
                      {isMulti ? (
                        // Checkbox for multi-select
                        <div
                          className={`
                            flex items-center justify-center w-6 h-6 rounded border-2 shrink-0
                            ${isSelected && !isAnswered ? "bg-primary border-primary" : "border-muted-foreground"}
                            ${showAsCorrect ? "bg-green-600 border-green-600" : ""}
                            ${showAsIncorrect ? "bg-destructive border-destructive" : ""}
                            ${showAsMissed ? "border-amber-500" : ""}
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
                      <span className={`flex-1 pt-0.5 text-sm md:text-base ${showAsCorrect || showAsMissed ? "font-medium" : ""}`}>
                        {option.text}
                      </span>
                      {showAsCorrect && <CheckCircle2 className="w-4 md:w-5 h-4 md:h-5 text-green-600 shrink-0" />}
                      {showAsIncorrect && <XCircle className="w-4 md:w-5 h-4 md:h-5 text-destructive shrink-0" />}
                      {showAsMissed && <CheckCircle2 className="w-4 md:w-5 h-4 md:h-5 text-amber-500 shrink-0" />}
                    </div>
                    {showAsCorrect && (
                      <div className="mt-1 pt-1 border-t border-green-600/20">
                        <span className="text-xs md:text-sm font-medium text-green-700 dark:text-green-400">
                          ✓ Correct Answer
                        </span>
                      </div>
                    )}
                    {showAsMissed && (
                      <div className="mt-1 pt-1 border-t border-amber-500/20">
                        <span className="text-xs md:text-sm font-medium text-amber-700 dark:text-amber-400">
                          ⚠ You missed this
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 md:gap-3 pt-2 md:pt-4">
              {!isAnswered ? (
                <>
                <Button
                  variant="ghost"
                  onClick={handleDontKnow}
                  disabled={submitAnswerMutation.isPending}
                  data-testid="button-dont-know"
                >
                  <HelpCircle className="w-4 h-4 mr-2" />
                  I don't know
                </Button>
                <Button
                  onClick={handleSubmitAnswer}
                  disabled={
                    (currentQuestion.questionType === 'single' && selectedAnswer === null) ||
                    (currentQuestion.questionType === 'text-input' && textAnswer.trim() === '') ||
                    (currentQuestion.questionType === 'map' && mapDisplayMode === 'text-to-map' && mapClick === null) ||
                    (currentQuestion.questionType === 'map' && mapDisplayMode === 'map-to-text' && textAnswer.trim() === '') ||
                    submitAnswerMutation.isPending
                  }
                  size="default"
                  data-testid="button-submit-answer"
                >
                  {submitAnswerMutation.isPending ? "Submitting..." : "Submit Answer"}
                </Button>
                </>
              ) : (
                <>
                  {isCorrect && (
                    <Button
                      variant="outline"
                      onClick={() => markKnownMutation.mutate(currentQuestion.id)}
                      disabled={isAdvancing || markKnownMutation.isPending}
                      title="You won't be asked this question again"
                      data-testid="button-mark-known"
                    >
                      <BookCheck className="w-4 h-4 mr-2" />
                      I know this
                    </Button>
                  )}
                  <Button
                    onClick={handleNextQuestion}
                    size="default"
                    disabled={isAdvancing || markKnownMutation.isPending}
                    data-testid="button-next-question"
                  >
                    {isAdvancing ? "Loading..." : ((dueQuestions?.length ?? 0) > 1 ? "Next Question" : "Finish Session")}
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Feedback Message */}
        {isAnswered && (
          <Card className={`border-2 ${isCorrect ? "border-green-600 bg-green-50 dark:bg-green-950/40" : "border-amber-600 bg-amber-50 dark:bg-amber-950/40"}`}>
            <CardContent className="pt-3 md:pt-6">
              <div className="space-y-2 md:space-y-3">
                <div className="flex items-center gap-2 md:gap-3">
                  {isCorrect ? (
                    <CheckCircle2 className="w-6 md:w-7 h-6 md:h-7 text-green-600 shrink-0" />
                  ) : (
                    <XCircle className="w-6 md:w-7 h-6 md:h-7 text-amber-600 shrink-0" />
                  )}
                  <div>
                    <p className="font-semibold text-base md:text-lg">
                      {isCorrect ? "Correct!" : answeredDontKnow ? "Here's the answer" : "Incorrect"}
                    </p>
                    <p className="text-xs md:text-sm text-muted-foreground">
                      {isCorrect
                        ? "Great job! You got it right."
                        : "The correct answer is shown above."}
                    </p>
                  </div>
                </div>
                {explanation && (isCorrect && !showExplanation ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-6 md:ml-8"
                    onClick={() => setShowExplanation(true)}
                    data-testid="button-show-explanation"
                  >
                    <BookOpen className="w-4 h-4 mr-2" />
                    Why?
                  </Button>
                ) : (
                  <div className="flex gap-2 md:gap-3 rounded-md bg-background/70 p-3 md:p-4" data-testid="text-explanation">
                    <BookOpen className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <p className="text-sm md:text-base leading-relaxed">{explanation}</p>
                  </div>
                ))}
                {!isCorrect && (
                  <p className="text-xs md:text-sm text-muted-foreground pl-8 md:pl-10">
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
