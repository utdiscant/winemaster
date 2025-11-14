import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wine, TrendingUp, Calendar, Target } from "lucide-react";
import type { Statistics } from "@shared/schema";

export default function ProgressPage() {
  const { data: stats, isLoading } = useQuery<Statistics>({
    queryKey: ["/api/statistics"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Wine className="w-12 h-12 text-primary mx-auto animate-pulse" />
          <p className="text-muted-foreground">Loading statistics...</p>
        </div>
      </div>
    );
  }

  const masteredPercentage = stats?.totalQuestions
    ? Math.round((stats.masteredQuestions / stats.totalQuestions) * 100)
    : 0;

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

        {/* Statistics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Total Mastered */}
          <Card data-testid="card-stat-mastered">
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Questions Mastered
              </CardTitle>
              <Target className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-3xl font-bold" data-testid="text-mastered-count">
                  {stats?.masteredQuestions ?? 0}
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-muted-foreground">
                    {masteredPercentage}% of {stats?.totalQuestions ?? 0} total
                  </div>
                </div>
                <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-full transition-all duration-500"
                    style={{ width: `${masteredPercentage}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Due Today */}
          <Card data-testid="card-stat-due">
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Due Today
              </CardTitle>
              <Calendar className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-3xl font-bold" data-testid="text-due-count">
                  {stats?.dueToday ?? 0}
                </div>
                <div className="text-sm text-muted-foreground">
                  Questions ready for review
                </div>
                {(stats?.dueToday ?? 0) > 0 && (
                  <Badge variant="default" className="mt-2">
                    Practice Now
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Total Reviews */}
          <Card data-testid="card-stat-reviews">
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Reviews
              </CardTitle>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-3xl font-bold" data-testid="text-reviews-count">
                  {stats?.totalReviews ?? 0}
                </div>
                <div className="text-sm text-muted-foreground">
                  Practice sessions completed
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-serif">Question Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overview" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
                <TabsTrigger value="upcoming" data-testid="tab-upcoming">Upcoming</TabsTrigger>
                <TabsTrigger value="learning" data-testid="tab-learning">Learning</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4" data-testid="content-overview">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                    <div className="space-y-1">
                      <p className="font-medium">New Questions</p>
                      <p className="text-sm text-muted-foreground">Not yet studied</p>
                    </div>
                    <Badge variant="secondary" data-testid="badge-new-count">
                      {stats?.newQuestions ?? 0}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                    <div className="space-y-1">
                      <p className="font-medium">Learning</p>
                      <p className="text-sm text-muted-foreground">In active review cycle</p>
                    </div>
                    <Badge variant="secondary" data-testid="badge-learning-count">
                      {stats?.learningQuestions ?? 0}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                    <div className="space-y-1">
                      <p className="font-medium">Mastered</p>
                      <p className="text-sm text-muted-foreground">Long-term retention achieved</p>
                    </div>
                    <Badge variant="default" data-testid="badge-mastered-count">
                      {stats?.masteredQuestions ?? 0}
                    </Badge>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="upcoming" className="space-y-4" data-testid="content-upcoming">
                <div className="text-center py-8 space-y-2">
                  <Calendar className="w-12 h-12 text-muted-foreground mx-auto" />
                  <p className="text-muted-foreground">
                    {stats?.dueThisWeek ?? 0} questions due this week
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="learning" className="space-y-4" data-testid="content-learning">
                <div className="text-center py-8 space-y-2">
                  <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto" />
                  <p className="text-muted-foreground">
                    Average ease factor: {stats?.averageEaseFactor.toFixed(2) ?? "N/A"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Higher numbers indicate better retention
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
