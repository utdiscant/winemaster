import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Wine, Grape } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { QuizQuestion } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";

export default function QuizPage() {
  const { toast } = useToast();
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [shuffledOptions, setShuffledOptions] = useState<{ text: string; originalIndex: number }[]>([]);
  const [correctAnswerIndex, setCorrectAnswerIndex] = useState<number>(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const { data: dueQuestions, isLoading } = useQuery<QuizQuestion[]>({
    queryKey: ["/api/quiz/due"],
  });

  const submitAnswerMutation = useMutation({
    mutationFn: async (data: { questionId: string; selectedAnswer: number }) => {
      return await apiRequest("POST", "/api/quiz/answer", data);
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quiz/due"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      
      setIsCorrect(response.correct);
      setIsAnswered(true);
    },
  });

  const currentQuestion = dueQuestions?.[currentQuestionIndex];

  // Shuffle options when question changes
  useEffect(() => {
    if (currentQuestion) {
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
      setSelectedAnswer(null);
      setIsAnswered(false);
    }
  }, [currentQuestion]);

  const handleAnswerSelect = (index: number) => {
    if (!isAnswered) {
      setSelectedAnswer(index);
    }
  };

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null || !currentQuestion) return;

    const originalAnswerIndex = shuffledOptions[selectedAnswer].originalIndex;
    setCorrectAnswerIndex(shuffledOptions.findIndex(opt => opt.originalIndex === 0));

    submitAnswerMutation.mutate({
      questionId: currentQuestion.id,
      selectedAnswer: originalAnswerIndex,
    });
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < (dueQuestions?.length ?? 0) - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      toast({
        title: "Session Complete!",
        description: "You've completed all due questions. Great work!",
      });
      setCurrentQuestionIndex(0);
      queryClient.invalidateQueries({ queryKey: ["/api/quiz/due"] });
    }
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

  const progressPercentage = ((currentQuestionIndex + 1) / dueQuestions.length) * 100;
  const difficultyLevel = Math.min(5, Math.max(1, Math.floor(Math.random() * 3) + 2)); // Mock difficulty for now

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Question {currentQuestionIndex + 1} of {dueQuestions.length}
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
            <div className="flex items-start justify-between gap-4">
              <Badge variant="secondary" className="shrink-0" data-testid="badge-question-number">
                #{currentQuestionIndex + 1}
              </Badge>
              <div className="flex items-center gap-1" data-testid="indicator-difficulty">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Grape
                    key={i}
                    className={`w-4 h-4 ${i < difficultyLevel ? "text-primary fill-primary" : "text-muted-foreground/30"}`}
                  />
                ))}
              </div>
            </div>
            {currentQuestion.category && (
              <Badge variant="outline" className="w-fit" data-testid={`badge-category-${currentQuestionIndex}`}>
                {currentQuestion.category}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            <h2 className="text-2xl md:text-3xl font-medium leading-relaxed" data-testid="text-question">
              {currentQuestion.question}
            </h2>

            {/* Answer Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {shuffledOptions.map((option, index) => {
                const isSelected = selectedAnswer === index;
                const showCorrect = isAnswered && index === correctAnswerIndex;
                const showIncorrect = isAnswered && isSelected && !isCorrect;

                return (
                  <button
                    key={index}
                    onClick={() => handleAnswerSelect(index)}
                    disabled={isAnswered}
                    data-testid={`button-answer-${index}`}
                    className={`
                      relative p-4 rounded-lg border-2 text-left transition-all
                      ${isSelected && !isAnswered ? "border-primary bg-primary/5" : "border-border"}
                      ${showCorrect ? "border-green-500 bg-green-50 dark:bg-green-950/30" : ""}
                      ${showIncorrect ? "border-destructive bg-destructive/5" : ""}
                      ${!isAnswered ? "hover-elevate active-elevate-2 cursor-pointer" : "cursor-default"}
                      disabled:opacity-100
                    `}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`
                          flex items-center justify-center w-8 h-8 rounded-full shrink-0 font-semibold text-sm
                          ${isSelected && !isAnswered ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}
                          ${showCorrect ? "bg-green-500 text-white" : ""}
                          ${showIncorrect ? "bg-destructive text-destructive-foreground" : ""}
                        `}
                      >
                        {String.fromCharCode(65 + index)}
                      </span>
                      <span className="flex-1 pt-1">{option.text}</span>
                      {showCorrect && <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />}
                      {showIncorrect && <XCircle className="w-6 h-6 text-destructive shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4">
              {!isAnswered ? (
                <Button
                  onClick={handleSubmitAnswer}
                  disabled={selectedAnswer === null || submitAnswerMutation.isPending}
                  size="lg"
                  data-testid="button-submit-answer"
                >
                  {submitAnswerMutation.isPending ? "Submitting..." : "Submit Answer"}
                </Button>
              ) : (
                <Button
                  onClick={handleNextQuestion}
                  size="lg"
                  data-testid="button-next-question"
                >
                  {currentQuestionIndex < dueQuestions.length - 1 ? "Next Question" : "Finish Session"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Feedback Message */}
        {isAnswered && (
          <Card className={`border-2 ${isCorrect ? "border-green-500 bg-green-50 dark:bg-green-950/30" : "border-amber-500 bg-amber-50 dark:bg-amber-950/30"}`}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                {isCorrect ? (
                  <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
                ) : (
                  <XCircle className="w-6 h-6 text-amber-600 shrink-0" />
                )}
                <p className="font-medium">
                  {isCorrect
                    ? "Correct! Well done."
                    : "Not quite right. The question will be reviewed again soon."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
