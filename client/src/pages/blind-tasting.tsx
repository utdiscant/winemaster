import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Wine, Eye, Wind, Droplet, CheckCircle2, XCircle, ChevronRight, Lightbulb } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface TastingNote {
  id: string;
  grape: string;
  region: string;
  appearance: {
    clarity: string;
    intensity: string;
    color: string;
    other_observations?: string[];
  };
  nose: {
    condition: string;
    intensity: string;
    aromas: {
      primary: string[];
      secondary: string[];
      tertiary: string[];
    };
    development: string;
  };
  palate: {
    sweetness: string;
    acidity: string;
    tannin: string;
    alcohol: string;
    body: string;
    flavour_intensity: string;
    flavours: {
      primary: string[];
      secondary: string[];
      tertiary: string[];
    };
    finish: string;
  };
  qualityAssessment: {
    quality_level: string;
    notes: string;
  };
}

interface BlindTastingSession {
  id: string;
  userId: string;
  targetWineId: string;
  currentClueStage: number;
  eliminatedWines: string[];
  completed: boolean;
  createdAt: string;
}

interface SessionData {
  session: BlindTastingSession | null;
  targetWine?: TastingNote;
  allWines?: TastingNote[];
}

// Helper function to determine if a wine is red or white based on appearance color
function isRedWine(wine: TastingNote): boolean {
  const color = wine.appearance.color.toLowerCase();
  const redIndicators = ["red", "ruby", "garnet", "brick", "tawny", "brown"];
  return redIndicators.some(indicator => color.includes(indicator));
}

// Helper function to get a hint for the user
function getHint(
  allWines: TastingNote[],
  eliminatedWines: string[],
  targetWine: TastingNote,
  currentClueStage: number
): { wine: TastingNote; reason: string } | null {
  const activeWines = allWines.filter(w => !eliminatedWines.includes(w.id) && w.id !== targetWine.id);
  if (activeWines.length === 0) return null;

  // Find a wine that differs in an obvious way from the current clue
  const hints: Array<{ wine: TastingNote; reason: string }> = [];

  for (const wine of activeWines) {
    if (currentClueStage === 0) {
      // Appearance stage - check for color differences
      if (isRedWine(wine) !== isRedWine(targetWine)) {
        hints.push({
          wine,
          reason: `has ${isRedWine(wine) ? "red" : "white"} appearance, but target is ${isRedWine(targetWine) ? "red" : "white"}`,
        });
      } else if (wine.appearance.color !== targetWine.appearance.color) {
        hints.push({
          wine,
          reason: `has different color (${wine.appearance.color} vs ${targetWine.appearance.color})`,
        });
      }
    } else if (currentClueStage === 1) {
      // Nose stage - check for different primary aromas
      const wineAromas = new Set(wine.nose.aromas.primary);
      const targetAromas = new Set(targetWine.nose.aromas.primary);
      const hasCommon = Array.from(wineAromas).some(a => targetAromas.has(a));

      if (!hasCommon && wine.nose.aromas.primary.length > 0) {
        hints.push({
          wine,
          reason: `has aromas (${wine.nose.aromas.primary[0]}) not in target wine`,
        });
      }
    } else {
      // Palate stage - check for different acidity or tannin
      if (wine.palate.acidity !== targetWine.palate.acidity) {
        hints.push({
          wine,
          reason: `has ${wine.palate.acidity} acidity, target has ${targetWine.palate.acidity}`,
        });
      } else if (wine.palate.tannin !== targetWine.palate.tannin) {
        hints.push({
          wine,
          reason: `has ${wine.palate.tannin} tannin, target has ${targetWine.palate.tannin}`,
        });
      }
    }
  }

  // Return a random hint from the collected hints
  return hints.length > 0 ? hints[Math.floor(Math.random() * hints.length)] : null;
}

export default function BlindTasting() {
  const { toast } = useToast();
  const [showHint, setShowHint] = useState(false);

  const { data: sessionData, isLoading } = useQuery<SessionData>({
    queryKey: ["/api/blind-tasting/current"],
  });

  const startSessionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest<SessionData>("POST", "/api/blind-tasting/start");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blind-tasting/current"] });
    },
  });

  const toggleEliminateMutation = useMutation({
    mutationFn: async ({ wineId, eliminate }: { wineId: string; eliminate: boolean }) => {
      return await apiRequest<any>("POST", "/api/blind-tasting/toggle-eliminate", { wineId, eliminate });
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast({
          title: data.action === "eliminated" ? "Wine Eliminated" : "Wine Restored",
          description: data.wine,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/blind-tasting/current"] });
    },
  });

  const advanceCluesMutation = useMutation({
    mutationFn: async () => {
      // Check if the correct wine has been eliminated
      if (sessionData?.session && sessionData?.targetWine && 
          sessionData.session.eliminatedWines.includes(sessionData.targetWine.id)) {
        throw new Error("CORRECT_WINE_ELIMINATED");
      }
      return await apiRequest("POST", "/api/blind-tasting/advance");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blind-tasting/current"] });
      toast({
        title: "Next Clue Revealed",
        description: "Use the new information to eliminate more wines",
      });
    },
    onError: (error: any) => {
      if (error.message === "CORRECT_WINE_ELIMINATED") {
        toast({
          title: "Oops! You eliminated the correct wine!",
          description: "Restore it and try again.",
          variant: "destructive",
        });
      }
    },
  });

  const completeSessionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/blind-tasting/complete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blind-tasting/current"] });
      toast({
        title: "Session Complete!",
        description: "Great work on identifying the wine!",
      });
    },
  });

  const handleStartSession = async () => {
    setShowHint(false);
    
    // If there's an active session, complete it first
    if (sessionData?.session && !sessionData.session.isCompleted) {
      try {
        await completeSessionMutation.mutateAsync();
      } catch (error) {
        // If completion fails, still try to start a new session
      }
    }
    
    startSessionMutation.mutate();
  };

  const handleWineToggle = (wineId: string, checked: boolean | "indeterminate") => {
    // Normalize indeterminate state to boolean
    const isChecked = checked === true;
    
    // Toggle elimination: unchecked = eliminate, checked = restore
    toggleEliminateMutation.mutate({ wineId, eliminate: !isChecked });
  };

  const renderAllClues = (stage: number, targetWine: TastingNote) => {
    return (
      <div className="space-y-3">
        {/* Appearance - always shown */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Appearance</h3>
          </div>
          <div className="text-xs md:text-sm space-y-1">
            <p><span className="font-medium">Clarity:</span> {targetWine.appearance.clarity}</p>
            <p><span className="font-medium">Intensity:</span> {targetWine.appearance.intensity}</p>
            <p><span className="font-medium">Color:</span> {targetWine.appearance.color}</p>
            {targetWine.appearance.other_observations && targetWine.appearance.other_observations.length > 0 && (
              <p><span className="font-medium">Other:</span> {targetWine.appearance.other_observations.join(", ")}</p>
            )}
          </div>
        </div>

        {/* Nose - shown if stage >= 1 */}
        {stage >= 1 && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Wind className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">Nose</h3>
              </div>
              <div className="text-xs md:text-sm space-y-1">
                <p><span className="font-medium">Condition:</span> {targetWine.nose.condition}</p>
                <p><span className="font-medium">Intensity:</span> {targetWine.nose.intensity}</p>
                <p><span className="font-medium">Development:</span> {targetWine.nose.development}</p>
                <div className="space-y-1">
                  <p className="font-medium">Primary Aromas:</p>
                  <div className="flex flex-wrap gap-1">
                    {targetWine.nose.aromas.primary.map((aroma, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">{aroma}</Badge>
                    ))}
                  </div>
                </div>
                {targetWine.nose.aromas.secondary.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-medium">Secondary Aromas:</p>
                    <div className="flex flex-wrap gap-1">
                      {targetWine.nose.aromas.secondary.map((aroma, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">{aroma}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Palate - shown if stage >= 2 */}
        {stage >= 2 && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Droplet className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">Palate</h3>
              </div>
              <div className="text-xs md:text-sm space-y-1">
                <p><span className="font-medium">Sweetness:</span> {targetWine.palate.sweetness}</p>
                <p><span className="font-medium">Acidity:</span> {targetWine.palate.acidity}</p>
                <p><span className="font-medium">Tannin:</span> {targetWine.palate.tannin}</p>
                <p><span className="font-medium">Alcohol:</span> {targetWine.palate.alcohol}</p>
                <p><span className="font-medium">Body:</span> {targetWine.palate.body}</p>
                <p><span className="font-medium">Finish:</span> {targetWine.palate.finish}</p>
                <div className="space-y-1">
                  <p className="font-medium">Primary Flavours:</p>
                  <div className="flex flex-wrap gap-1">
                    {targetWine.palate.flavours.primary.map((flavour, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">{flavour}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const session = sessionData?.session;
  const targetWine = sessionData?.targetWine;
  const allWines = sessionData?.allWines || [];

  if (!session || session.completed) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Wine className="w-12 h-12 mx-auto mb-2 text-primary" />
            <CardTitle>Blind Taste Simulator</CardTitle>
            <CardDescription>
              Practice your wine identification skills by eliminating wines based on tasting clues
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-xs md:text-sm space-y-2 text-muted-foreground">
              <p>How it works:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>You'll receive clues about a mystery wine</li>
                <li>Start with appearance, then nose, then palate</li>
                <li>Eliminate wines that don't match the clues</li>
                <li>Continue until you've identified the wine!</li>
              </ul>
            </div>
            <Button
              onClick={handleStartSession}
              disabled={startSessionMutation.isPending}
              className="w-full"
              data-testid="button-start-session"
            >
              {startSessionMutation.isPending ? "Starting..." : "Start New Session"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!targetWine) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-destructive">Error loading session</p>
      </div>
    );
  }

  const activeWines = allWines.filter(w => !session.eliminatedWines.includes(w.id));
  const eliminatedCount = session.eliminatedWines.length;

  return (
    <div className="h-full overflow-auto p-2 md:p-4">
      <div className="max-w-6xl mx-auto space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg md:text-2xl font-bold">Blind Taste Simulator</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              Eliminate wines that don't match the clues
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleStartSession}
            data-testid="button-new-session"
          >
            New Session
          </Button>
        </div>

        {/* Progress */}
        <Card>
          <CardHeader className="p-3 md:p-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm md:text-base">Progress</CardTitle>
                <CardDescription className="text-xs">
                  {eliminatedCount} wines eliminated • {activeWines.length} remaining
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Badge variant={session.currentClueStage >= 0 ? "default" : "outline"} className="text-xs">
                  Appearance
                </Badge>
                <Badge variant={session.currentClueStage >= 1 ? "default" : "outline"} className="text-xs">
                  Nose
                </Badge>
                <Badge variant={session.currentClueStage >= 2 ? "default" : "outline"} className="text-xs">
                  Palate
                </Badge>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid md:grid-cols-2 gap-3">
          {/* Clues Card */}
          <Card>
            <CardHeader className="p-3 md:p-4">
              <CardTitle className="text-sm md:text-base">Current Clue</CardTitle>
            </CardHeader>
            <CardContent className="p-3 md:p-4 pt-0 space-y-3">
              {renderAllClues(session.currentClueStage, targetWine)}
              
              <Separator />
              
              {session.currentClueStage < 2 ? (
                <Button
                  onClick={() => advanceCluesMutation.mutate()}
                  disabled={advanceCluesMutation.isPending}
                  className="w-full"
                  data-testid="button-next-clue"
                >
                  {advanceCluesMutation.isPending ? "Revealing..." : "Reveal Next Clue"}
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              ) : activeWines.length === 1 ? (
                <div className="space-y-2">
                  <div className="text-center p-3 bg-primary/10 rounded-md">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <p className="font-semibold text-sm">You've identified the wine!</p>
                    <p className="text-lg font-bold text-primary mt-1">
                      {activeWines[0].grape} from {activeWines[0].region}
                    </p>
                  </div>
                  <Button
                    onClick={() => completeSessionMutation.mutate()}
                    disabled={completeSessionMutation.isPending}
                    className="w-full"
                    data-testid="button-complete-session"
                  >
                    Complete Session
                  </Button>
                </div>
              ) : (
                <div className="text-center p-3 bg-muted rounded-md">
                  <p className="text-xs md:text-sm text-muted-foreground">
                    All clues revealed. Continue eliminating wines to find the answer!
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Wine Options Card */}
          <Card>
            <CardHeader className="p-3 md:p-4">
              <CardTitle className="text-sm md:text-base">Wine Options</CardTitle>
              <CardDescription className="text-xs">
                Keep wines checked if they could match the clues. Uncheck to eliminate.
              </CardDescription>
              {/* Bulk eliminate buttons */}
              <div className="flex gap-1 mt-3 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const redWines = allWines.filter(w => isRedWine(w) && !session.eliminatedWines.includes(w.id));
                    redWines.forEach(wine => {
                      toggleEliminateMutation.mutate({ wineId: wine.id, eliminate: true });
                    });
                  }}
                  disabled={toggleEliminateMutation.isPending}
                  className="text-xs"
                  data-testid="button-eliminate-reds"
                >
                  Eliminate All Reds
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const whiteWines = allWines.filter(w => !isRedWine(w) && !session.eliminatedWines.includes(w.id));
                    whiteWines.forEach(wine => {
                      toggleEliminateMutation.mutate({ wineId: wine.id, eliminate: true });
                    });
                  }}
                  disabled={toggleEliminateMutation.isPending}
                  className="text-xs"
                  data-testid="button-eliminate-whites"
                >
                  Eliminate All Whites
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowHint(!showHint)}
                  className="text-xs gap-1"
                  data-testid="button-hint"
                >
                  <Lightbulb className="w-3 h-3" />
                  Hint
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3 md:p-4 pt-0">
              {/* Hint display */}
              {showHint && session && (
                <div className="mb-3 p-2 bg-primary/10 rounded-md border border-primary/20">
                  {(() => {
                    const hint = getHint(allWines, session.eliminatedWines, targetWine, session.currentClueStage);
                    if (hint) {
                      return (
                        <div className="text-xs space-y-1">
                          <p className="font-medium">Hint:</p>
                          <p>
                            Consider eliminating <span className="font-semibold">{hint.wine.grape}</span> ({hint.wine.region}) — it {hint.reason}.
                          </p>
                        </div>
                      );
                    }
                    return <p className="text-xs text-muted-foreground">No hints available yet!</p>;
                  })()}
                </div>
              )}
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {allWines.map((wine) => {
                  const isEliminated = session.eliminatedWines.includes(wine.id);
                  // Wine is checked (kept) if it's NOT eliminated
                  const isChecked = !isEliminated;
                  
                  return (
                    <div
                      key={wine.id}
                      className={`flex items-center gap-2 p-2 rounded-md border ${
                        isEliminated ? "opacity-40 bg-muted" : "hover-elevate"
                      }`}
                      data-testid={`wine-item-${wine.id}`}
                    >
                      <Checkbox
                        id={wine.id}
                        checked={isChecked}
                        disabled={toggleEliminateMutation.isPending}
                        onCheckedChange={(checked) => 
                          handleWineToggle(wine.id, checked)
                        }
                        data-testid={`checkbox-wine-${wine.id}`}
                      />
                      <Label
                        htmlFor={wine.id}
                        className="flex-1 cursor-pointer text-xs md:text-sm"
                      >
                        <span className="font-medium">{wine.grape}</span>
                        <span className="text-muted-foreground"> from {wine.region}</span>
                      </Label>
                      {isEliminated && (
                        <XCircle className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
