import { useState } from "react";
import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Wine, BarChart3, Upload, Settings, LogOut, User, Users, Menu, FlaskConical } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/landing";
import QuizPage from "@/pages/quiz";
import ProgressPage from "@/pages/progress";
import ProfilePage from "@/pages/profile";
import UploadPage from "@/pages/upload";
import AdminPage from "@/pages/admin";
import UsersPage from "@/pages/users";
import BlindTastingPage from "@/pages/blind-tasting";
import NotFound from "@/pages/not-found";

function Navigation() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const { user, isAdmin } = useAuth();

  const navItems = [
    { path: "/", icon: Wine, label: "Learn" },
    { path: "/blind-tasting", icon: FlaskConical, label: "Blind Tasting" },
    { path: "/progress", icon: BarChart3, label: "Progress" },
    { path: "/profile", icon: User, label: "Profile" },
    ...(isAdmin ? [{ path: "/upload", icon: Upload, label: "Upload" }] : []),
    ...(isAdmin ? [{ path: "/admin", icon: Settings, label: "Admin" }] : []),
    ...(isAdmin ? [{ path: "/users", icon: Users, label: "Users" }] : []),
  ];

  const NavButtons = () => (
    <>
      {navItems.map((item) => {
        const isActive = location === item.path;
        const Icon = item.icon;
        return (
          <Link key={item.path} href={item.path} data-testid={`link-nav-${item.label.toLowerCase()}`} onClick={() => setOpen(false)}>
            <Button
              variant={isActive ? "default" : "ghost"}
              className="gap-2 w-full justify-start"
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </Button>
          </Link>
        );
      })}
      
      {user && (
        <Button
          variant="ghost"
          className="gap-2 w-full justify-start"
          onClick={() => {
            setOpen(false);
            window.location.href = "/api/logout";
          }}
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </Button>
      )}
    </>
  );

  return (
    <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group" data-testid="link-home">
            <Wine className="w-7 h-7 md:w-8 md:h-8 text-primary" />
            <span className="text-lg md:text-xl font-serif font-semibold">Wine Master</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-2">
            <NavButtons />
          </div>

          {/* Mobile Menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" data-testid="button-sidebar-toggle">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <div className="space-y-2 mt-8">
                <NavButtons />
              </div>
            </SheetContent>
          </Sheet>
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
        <Route path="/blind-tasting" component={BlindTastingPage} />
        <Route path="/progress" component={ProgressPage} />
        <Route path="/profile" component={ProfilePage} />
        {isAdmin && <Route path="/upload" component={UploadPage} />}
        {isAdmin && <Route path="/admin" component={AdminPage} />}
        {isAdmin && <Route path="/users" component={UsersPage} />}
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
