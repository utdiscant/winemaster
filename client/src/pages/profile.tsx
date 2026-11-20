import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { User, BookOpen, Save, ListChecks } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { User as UserType } from "@shared/schema";

export default function ProfilePage() {
  const { toast } = useToast();
  const [selectedCurricula, setSelectedCurricula] = useState<string[]>([]);
  const [pausedCategories, setPausedCategories] = useState<string[]>([]);

  const { data: user, isLoading: isLoadingUser } = useQuery<UserType>({
    queryKey: ["/api/auth/user"],
  });

  const { data: availableCurricula, isLoading: isLoadingCurricula } = useQuery<string[]>({
    queryKey: ["/api/curricula"],
  });

  const { data: allCategories, isLoading: isLoadingCategories } = useQuery<string[]>({
    queryKey: ["/api/categories"],
  });

  // Initialize selected curricula and paused chapters from user data
  useEffect(() => {
    if (user?.selectedCurricula) {
      setSelectedCurricula(user.selectedCurricula);
    }
    setPausedCategories(user?.pausedCategories ?? []);
  }, [user]);

  const saveChaptersMutation = useMutation<UserType, Error, string[]>({
    mutationFn: async (paused: string[]) => {
      return await apiRequest("PATCH", "/api/user/paused-categories", { pausedCategories: paused });
    },
    onSuccess: () => {
      toast({
        title: "Chapters Saved",
        description: "Paused chapters are left out of your quizzes and statistics.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quiz/due"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/quiz/categories"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/progress/cards"] });
    },
    onError: (error: Error) => {
      toast({ title: "Save Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleToggleChapter = (category: string) => {
    setPausedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const saveMutation = useMutation<UserType, Error, string[]>({
    mutationFn: async (curricula: string[]) => {
      return await apiRequest("PATCH", "/api/user/curricula", { curricula });
    },
    onSuccess: () => {
      toast({
        title: "Preferences Saved",
        description: "Your curriculum preferences have been updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quiz/due"], exact: false });
    },
    onError: (error: Error) => {
      toast({
        title: "Save Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleToggleCurriculum = (curriculum: string) => {
    setSelectedCurricula((prev) =>
      prev.includes(curriculum)
        ? prev.filter((c) => c !== curriculum)
        : [...prev, curriculum]
    );
  };

  const handleSave = () => {
    saveMutation.mutate(selectedCurricula);
  };

  if (isLoadingUser || isLoadingCurricula || isLoadingCategories) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <User className="w-12 h-12 text-primary mx-auto animate-pulse" />
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  const hasChanges = JSON.stringify(selectedCurricula.sort()) !== JSON.stringify((user?.selectedCurricula || []).sort());
  const hasChapterChanges =
    JSON.stringify([...pausedCategories].sort()) !== JSON.stringify([...(user?.pausedCategories ?? [])].sort());
  const studyingCount = (allCategories ?? []).filter((c) => !pausedCategories.includes(c)).length;

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl font-serif font-semibold" data-testid="text-page-title">
            Profile Settings
          </h1>
          <p className="text-muted-foreground text-lg">
            Customize your wine learning experience
          </p>
        </div>

        {/* User Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-serif flex items-center gap-2">
              <User className="w-5 h-5" />
              Account Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium" data-testid="text-user-name">
                  {user?.firstName && user?.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : "Not set"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium" data-testid="text-user-email">
                  {user?.email || "Not set"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Role</p>
                <Badge variant={user?.isAdmin ? "default" : "secondary"} data-testid="badge-user-role">
                  {user?.isAdmin ? "Admin" : "Student"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Curriculum Preferences Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-serif flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Curriculum Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">
              Select the curricula you want to study. Your quiz questions will only include questions from the selected curricula.
            </p>

            {!availableCurricula || availableCurricula.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No curricula available yet.</p>
                <p className="text-sm mt-2">Questions with curriculum tags will appear here once uploaded.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {availableCurricula.map((curriculum) => (
                    <div
                      key={curriculum}
                      className="flex items-center space-x-3 px-4 rounded-lg border border-border hover-elevate active-elevate-2"
                      data-testid={`curriculum-option-${curriculum}`}
                    >
                      <Checkbox
                        id={`curriculum-${curriculum}`}
                        checked={selectedCurricula.includes(curriculum)}
                        onCheckedChange={() => handleToggleCurriculum(curriculum)}
                        data-testid={`checkbox-curriculum-${curriculum}`}
                      />
                      <label
                        htmlFor={`curriculum-${curriculum}`}
                        className="py-4 text-sm font-medium leading-none cursor-pointer flex-1"
                      >
                        {curriculum}
                      </label>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/50 border border-accent-border">
                  <div className="text-sm text-accent-foreground">
                    {selectedCurricula.length === 0 ? (
                      <p className="font-medium">No curricula selected - you will be quizzed on all questions</p>
                    ) : (
                      <p>
                        <span className="font-medium">{selectedCurricula.length} curriculum{selectedCurricula.length !== 1 ? 'a' : ''} selected:</span>{' '}
                        {selectedCurricula.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <Button
              onClick={handleSave}
              disabled={!hasChanges || saveMutation.isPending}
              size="lg"
              className="w-full"
              data-testid="button-save-preferences"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? "Saving..." : "Save Preferences"}
            </Button>
          </CardContent>
        </Card>

        {/* Chapters: pause the ones not covered in the course yet */}
        {allCategories && allCategories.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-serif flex items-center gap-2">
                <ListChecks className="w-5 h-5" />
                Chapters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-muted-foreground">
                Untick chapters you haven't covered yet. They're left out of your quizzes and statistics until you tick
                them again. Your progress in them is kept.
              </p>

              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-medium" data-testid="text-chapters-studying">
                  Studying {studyingCount} of {allCategories.length} chapters
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPausedCategories([])} data-testid="button-chapters-all">
                    All
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPausedCategories([...allCategories])} data-testid="button-chapters-none">
                    None
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {allCategories.map((category, index) => (
                  <div
                    key={category}
                    className="flex items-center space-x-3 px-3 rounded-lg border border-border hover-elevate"
                    data-testid={`chapter-option-${category}`}
                  >
                    <Checkbox
                      id={`chapter-${index}`}
                      checked={!pausedCategories.includes(category)}
                      onCheckedChange={() => handleToggleChapter(category)}
                    />
                    {/* A label linked by id, not wrapping the checkbox: wrapping toggles it twice per click */}
                    <label
                      htmlFor={`chapter-${index}`}
                      className={`py-3 text-sm leading-tight flex-1 cursor-pointer ${pausedCategories.includes(category) ? "text-muted-foreground" : "font-medium"}`}
                    >
                      {category}
                    </label>
                  </div>
                ))}
              </div>

              <Button
                onClick={() => saveChaptersMutation.mutate(pausedCategories)}
                disabled={!hasChapterChanges || saveChaptersMutation.isPending}
                size="lg"
                className="w-full"
                data-testid="button-save-chapters"
              >
                <Save className="w-4 h-4 mr-2" />
                {saveChaptersMutation.isPending ? "Saving..." : "Save Chapters"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
