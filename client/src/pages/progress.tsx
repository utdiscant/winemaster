import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Wine, Calendar, Target, TrendingUp, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import type { Statistics } from "@shared/schema";

interface QuestionCard {
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
}

export default function ProgressPage() {
  const [, setLocation] = useLocation();

  const { data: stats, isLoading: loadingStats, refetch: refetchStats } = useQuery<Statistics>({
    queryKey: ["/api/statistics"],
    refetchOnMount: 'always', // Always refetch when component mounts
    staleTime: 0, // Consider data stale immediately
  });

  const { data: questionCards, isLoading: loadingCards, refetch: refetchCards } = useQuery<QuestionCard[]>({
    queryKey: ["/api/progress/cards"],
    refetchOnMount: 'always', // Always refetch when component mounts
    staleTime: 0, // Consider data stale immediately
  });

  const isLoading = loadingStats || loadingCards;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Wine className="w-12 h-12 text-primary mx-auto animate-pulse" />
          <p className="text-muted-foreground">Loading your progress...</p>
        </div>
      </div>
    );
  }

  // Categorize questions
  const newQuestions = questionCards?.filter(card => card.repetitions === 0) || [];
  const learningQuestions = questionCards?.filter(card => card.repetitions > 0 && card.repetitions < 3) || [];
  const masteredQuestions = questionCards?.filter(card => card.repetitions >= 3 && card.interval >= 21) || [];
  const dueQuestions = questionCards?.filter(card => {
    const cardDate = new Date(card.nextReviewDate);
    const now = new Date();
    return cardDate <= now;
  }) || [];

  const masteredPercentage = stats?.totalQuestions
    ? Math.round((stats.masteredQuestions / stats.totalQuestions) * 100)
    : 0;

  const QuestionListItem = ({ card }: { card: QuestionCard }) => (
    <div className="flex items-start justify-between p-4 rounded-lg border border-border gap-4 hover-elevate" data-testid={`question-item-${card.questionId}`}>
      <div className="flex-1 min-w-0">
        <p className="font-medium mb-2 line-clamp-2">{card.question}</p>
        <div className="flex items-center gap-2 flex-wrap">
          {card.category && (
            <Badge variant="outline" className="text-xs">
              {card.category}
            </Badge>
          )}
          {card.curriculum && (
            <Badge variant="secondary" className="text-xs">
              {card.curriculum}
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs">
            {card.questionType === 'multi' ? 'Multi-Select' : 'Single Choice'}
          </Badge>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-medium text-muted-foreground">
          {card.repetitions} review{card.repetitions !== 1 ? 's' : ''}
        </div>
        {card.interval > 0 && (
          <div className="text-xs text-muted-foreground">
            {card.interval} day interval
          </div>
        )}
      </div>
    </div>
  );

  const EmptyState = ({ message }: { message: string }) => (
    <div className="text-center py-12 text-muted-foreground">
      {message}
    </div>
  );

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl font-serif font-semibold" data-testid="text-page-title">
            Your Progress
          </h1>
          <p className="text-muted-foreground text-lg">
            Track your wine knowledge mastery journey
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Due Today */}
          <Card data-testid="card-stat-due">
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Due Today
              </CardTitle>
              <Calendar className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="text-3xl font-bold" data-testid="text-due-count">
                  {stats?.dueToday ?? 0}
                </div>
                {(stats?.dueToday ?? 0) > 0 && (
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="w-full gap-2"
                    onClick={() => setLocation('/')}
                    data-testid="button-practice-now"
                  >
                    Practice Now
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* New Questions */}
          <Card data-testid="card-stat-new">
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                New
              </CardTitle>
              <Wine className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="text-new-count">
                {stats?.newQuestions ?? 0}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Not yet studied
              </p>
            </CardContent>
          </Card>

          {/* Learning */}
          <Card data-testid="card-stat-learning">
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Learning
              </CardTitle>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="text-learning-count">
                {stats?.learningQuestions ?? 0}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                In review cycle
              </p>
            </CardContent>
          </Card>

          {/* Mastered */}
          <Card data-testid="card-stat-mastered">
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Mastered
              </CardTitle>
              <Target className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-3xl font-bold" data-testid="text-mastered-count">
                  {stats?.masteredQuestions ?? 0}
                </div>
                <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-full transition-all duration-500"
                    style={{ width: `${masteredPercentage}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {masteredPercentage}% of {stats?.totalQuestions ?? 0}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Question Lists */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-serif">Question Details</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs 
              defaultValue="due" 
              className="space-y-6"
              onValueChange={() => {
                // Refetch both queries when switching tabs to ensure fresh data
                refetchStats();
                refetchCards();
              }}
            >
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="due" data-testid="tab-due">
                  Due ({dueQuestions.length})
                </TabsTrigger>
                <TabsTrigger value="new" data-testid="tab-new">
                  New ({newQuestions.length})
                </TabsTrigger>
                <TabsTrigger value="learning" data-testid="tab-learning">
                  Learning ({learningQuestions.length})
                </TabsTrigger>
                <TabsTrigger value="mastered" data-testid="tab-mastered">
                  Mastered ({masteredQuestions.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="due" data-testid="content-due">
                <ScrollArea className="h-[500px] pr-4">
                  {dueQuestions.length > 0 ? (
                    <div className="space-y-3">
                      {dueQuestions.map(card => (
                        <QuestionListItem key={card.reviewCardId} card={card} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="No questions due right now. Great job staying on top of your reviews!" />
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="new" data-testid="content-new">
                <ScrollArea className="h-[500px] pr-4">
                  {newQuestions.length > 0 ? (
                    <div className="space-y-3">
                      {newQuestions.map(card => (
                        <QuestionListItem key={card.reviewCardId} card={card} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="You've started studying all available questions!" />
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="learning" data-testid="content-learning">
                <ScrollArea className="h-[500px] pr-4">
                  {learningQuestions.length > 0 ? (
                    <div className="space-y-3">
                      {learningQuestions.map(card => (
                        <QuestionListItem key={card.reviewCardId} card={card} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="No questions in the learning phase. Keep reviewing to build mastery!" />
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="mastered" data-testid="content-mastered">
                <ScrollArea className="h-[500px] pr-4">
                  {masteredQuestions.length > 0 ? (
                    <div className="space-y-3">
                      {masteredQuestions.map(card => (
                        <QuestionListItem key={card.reviewCardId} card={card} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="No questions mastered yet. Keep practicing to achieve long-term retention!" />
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
