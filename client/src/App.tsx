import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Wine, BarChart3, Upload, Settings, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/landing";
import QuizPage from "@/pages/quiz";
import ProgressPage from "@/pages/progress";
import UploadPage from "@/pages/upload";
import AdminPage from "@/pages/admin";
import NotFound from "@/pages/not-found";

function Navigation() {
  const [location] = useLocation();
  const { user, isAdmin } = useAuth();

  const navItems = [
    { path: "/", icon: Wine, label: "Quiz" },
    { path: "/progress", icon: BarChart3, label: "Progress" },
    ...(isAdmin ? [{ path: "/upload", icon: Upload, label: "Upload" }] : []),
    ...(isAdmin ? [{ path: "/admin", icon: Settings, label: "Admin" }] : []),
  ];

  return (
    <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group" data-testid="link-home">
            <Wine className="w-8 h-8 text-primary" />
            <span className="text-xl font-serif font-semibold">Wine Master</span>
          </Link>

          <div className="flex items-center gap-2">
            {navItems.map((item) => {
              const isActive = location === item.path;
              const Icon = item.icon;
              return (
                <Link key={item.path} href={item.path} data-testid={`link-nav-${item.label.toLowerCase()}`}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    className="gap-2"
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Button>
                </Link>
              );
            })}
            
            {user && (
              <Button
                variant="ghost"
                className="gap-2"
                onClick={() => window.location.href = "/api/logout"}
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

function Router() {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Wine className="w-12 h-12 text-primary animate-pulse mx-auto" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Landing />;
  }

  return (
    <>
      <Navigation />
      <Switch>
        <Route path="/" component={QuizPage} />
        <Route path="/progress" component={ProgressPage} />
        {isAdmin && <Route path="/upload" component={UploadPage} />}
        {isAdmin && <Route path="/admin" component={AdminPage} />}
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-background">
          <Router />
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
