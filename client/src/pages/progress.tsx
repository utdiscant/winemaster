import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Wine, Calendar, Target, TrendingUp, ChevronRight, Star } from "lucide-react";
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

  // Calculate mastery level for a question (0-100)
  const calculateMastery = (card: QuestionCard): number => {
    const { repetitions, interval, easeFactor } = card;
    
    // New questions have 0% mastery
    if (repetitions === 0) return 0;
    
    // Learning questions (1-2 reps) have medium mastery
    if (repetitions === 1) return 25;
    if (repetitions === 2) return 50;
    
    // Mastered questions (3+ reps, 21+ day interval) have high mastery
    if (repetitions >= 3 && interval >= 21) {
      // Scale based on interval and ease factor
      const intervalScore = Math.min(interval / 180, 1) * 20; // Up to 20 points for long intervals (capped at 180 days)
      const easeScore = Math.min((easeFactor - 1.3) / (3.0 - 1.3), 1) * 10; // Up to 10 points for ease factor
      const mastery = 70 + intervalScore + easeScore; // Base 70 + bonuses (max 100)
      return Math.min(100, Math.round(mastery)); // Cap at 100%
    }
    
    // Advanced learning (3+ reps but interval < 21) - between learning and mastered
    if (repetitions >= 3) {
      // Scale from 50-69% based on interval progress toward 21 days
      const intervalProgress = Math.min(interval / 21, 1);
      const mastery = 50 + (intervalProgress * 19); // 50% to 69%
      return Math.round(mastery);
    }
    
    return 0;
  };

  // Get mastery level badge
  const getMasteryBadge = (mastery: number) => {
    if (mastery >= 80) return { label: "Expert", variant: "default" as const, color: "text-primary" };
    if (mastery >= 60) return { label: "Strong", variant: "secondary" as const, color: "text-green-600 dark:text-green-400" };
    if (mastery >= 40) return { label: "Learning", variant: "secondary" as const, color: "text-yellow-600 dark:text-yellow-400" };
    if (mastery >= 20) return { label: "Developing", variant: "outline" as const, color: "text-orange-600 dark:text-orange-400" };
    return { label: "New", variant: "outline" as const, color: "text-muted-foreground" };
  };

  // Calculate category mastery scores
  interface CategoryMastery {
    category: string;
    totalQuestions: number;
    averageMastery: number;
    masteredCount: number;
  }

  const calculateCategoryMastery = (): CategoryMastery[] => {
    if (!questionCards) return [];
    
    const categoryMap = new Map<string, QuestionCard[]>();
    
    // Group questions by category
    questionCards.forEach(card => {
      const category = card.category || "Uncategorized";
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push(card);
    });
    
    // Calculate mastery for each category
    const categoryStats: CategoryMastery[] = Array.from(categoryMap.entries()).map(([category, cards]) => {
      const totalMastery = cards.reduce((sum, card) => sum + calculateMastery(card), 0);
      const averageMastery = Math.round(totalMastery / cards.length);
      const masteredCount = cards.filter(card => card.repetitions >= 3 && card.interval >= 21).length;
      
      return {
        category,
        totalQuestions: cards.length,
        averageMastery,
        masteredCount,
      };
    });
    
    // Sort by mastery (lowest first so users can focus on weak areas)
    return categoryStats.sort((a, b) => a.averageMastery - b.averageMastery);
  };

  const categoryMasteryData = calculateCategoryMastery();

  const QuestionListItem = ({ card }: { card: QuestionCard }) => {
    const mastery = calculateMastery(card);
    const masteryBadge = getMasteryBadge(mastery);
    
    return (
    <div className="flex items-start justify-between p-4 rounded-lg border border-border gap-4 hover-elevate" data-testid={`question-item-${card.questionId}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="font-medium line-clamp-2 flex-1">{card.question}</p>
          <Badge variant={masteryBadge.variant} className={`text-xs shrink-0 ${masteryBadge.color}`}>
            {masteryBadge.label}
          </Badge>
        </div>
        <div className="space-y-2 mb-2">
          <div className="flex items-center gap-2">
            <Progress value={mastery} className="h-1.5 flex-1" />
            <span className="text-xs text-muted-foreground shrink-0 w-10 text-right">{mastery}%</span>
          </div>
        </div>
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
        {card.easeFactor && (
          <div className="text-xs text-muted-foreground">
            {card.easeFactor.toFixed(1)} ease
          </div>
        )}
      </div>
    </div>
  );
  };

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

        {/* Category Mastery */}
        {categoryMasteryData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-serif">Category Mastery</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Track your performance across different wine topics
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {categoryMasteryData.map((cat) => (
                  <div 
                    key={cat.category} 
                    className="p-4 rounded-lg border border-border hover-elevate"
                    data-testid={`category-${cat.category}`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{cat.category}</h3>
                        <p className="text-sm text-muted-foreground">
                          {cat.totalQuestions} question{cat.totalQuestions !== 1 ? 's' : ''} · {cat.masteredCount} mastered
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-2xl font-bold">{cat.averageMastery}%</div>
                        <p className="text-xs text-muted-foreground">average</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={cat.averageMastery} className="h-2 flex-1" />
                      {cat.averageMastery >= 80 && <Badge variant="default">Expert</Badge>}
                      {cat.averageMastery >= 60 && cat.averageMastery < 80 && <Badge variant="secondary" className="text-green-600 dark:text-green-400">Strong</Badge>}
                      {cat.averageMastery >= 40 && cat.averageMastery < 60 && <Badge variant="secondary" className="text-yellow-600 dark:text-yellow-400">Learning</Badge>}
                      {cat.averageMastery >= 20 && cat.averageMastery < 40 && <Badge variant="outline" className="text-orange-600 dark:text-orange-400">Developing</Badge>}
                      {cat.averageMastery < 20 && <Badge variant="outline">Needs Practice</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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
