import { Wine, GraduationCap, Brain, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="text-center space-y-8">
            {/* Logo/Icon */}
            <div className="flex justify-center">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
                <Wine className="w-12 h-12 text-primary" />
              </div>
            </div>

            {/* Heading */}
            <div className="space-y-4">
              <h1 className="text-5xl md:text-6xl font-semibold font-serif text-foreground">
                Wine Master
              </h1>
              <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">Master wine knowledge through intelligent quizzes and exercises - for free</p>
            </div>

            {/* CTA */}
            <div className="flex flex-col items-center gap-4">
              <Button
                size="lg"
                onClick={() => window.location.href = "/api/login"}
                className="text-lg px-8"
                data-testid="button-login"
              >
                Get Started
              </Button>

              {/* Dev-only quick login buttons */}
              {import.meta.env.DEV && (
                <div className="flex flex-col items-center gap-2 mt-4 p-4 bg-muted/50 rounded-lg border border-dashed border-primary/30">
                  <p className="text-xs text-muted-foreground font-mono">DEV MODE - Quick Login</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.location.href = "/api/dev/login-admin"}
                      data-testid="button-dev-login-admin"
                    >
                      Login as Admin
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.location.href = "/api/dev/login-user"}
                      data-testid="button-dev-login-user"
                    >
                      Login as User
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 space-y-4">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Brain className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold">Smart Learning</h3>
            <p className="text-muted-foreground">Uses proven algorithms to optimize your review schedule and maximize retention</p>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold">Wine Expertise</h3>
            <p className="text-muted-foreground">
              Practice questions on regions, grape varieties, winemaking techniques, and more
            </p>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold">Track Progress</h3>
            <p className="text-muted-foreground">
              Monitor your learning journey with detailed statistics and performance insights
            </p>
          </Card>
        </div>
      </div>
      {/* How It Works Section */}
      <div className="bg-muted/30 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold font-serif text-center mb-12">
            How It Works
          </h2>
          
          <div className="space-y-8">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-semibold">
                1
              </div>
              <div>
                <h4 className="text-lg font-semibold mb-2">Sign In</h4>
                <p className="text-muted-foreground">
                  Log in with Google, GitHub, or email to start your wine education journey
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-semibold">
                2
              </div>
              <div>
                <h4 className="text-lg font-semibold mb-2">Study Questions</h4>
                <p className="text-muted-foreground">
                  Practice wine knowledge with multiple-choice questions tailored to your progress
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-semibold">
                3
              </div>
              <div>
                <h4 className="text-lg font-semibold mb-2">Review Smartly</h4>
                <p className="text-muted-foreground">
                  The algorithm schedules reviews at optimal intervals to strengthen your memory
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-semibold">
                4
              </div>
              <div>
                <h4 className="text-lg font-semibold mb-2">Master Wine Knowledge</h4>
                <p className="text-muted-foreground">
                  Track your progress and watch your wine expertise grow over time
                </p>
              </div>
            </div>
          </div>

          <div className="mt-12 text-center">
            <Button
              size="lg"
              variant="outline"
              onClick={() => window.location.href = "/api/login"}
              data-testid="button-login-bottom"
            >
              Start Learning Now
            </Button>
          </div>
        </div>
      </div>
      {/* Footer */}
      <div className="py-8 border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
          <p>Master wine knowledge through intelligent spaced repetition</p>
        </div>
      </div>
    </div>
  );
}
