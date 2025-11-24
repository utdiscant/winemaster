import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Wine, Eye, Wind, Droplet, CheckCircle2, XCircle, ChevronRight } from "lucide-react";
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

export default function BlindTasting() {
  const { toast } = useToast();
  const [checkedWines, setCheckedWines] = useState<Set<string>>(new Set());

  const { data: sessionData, isLoading } = useQuery<SessionData>({
    queryKey: ["/api/blind-tasting/current"],
  });

  const startSessionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest<SessionData>("/api/blind-tasting/start", "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blind-tasting/current"] });
    },
  });

  const eliminateMutation = useMutation({
    mutationFn: async (wineId: string) => {
      return await apiRequest<any>("/api/blind-tasting/eliminate", "POST", { wineId });
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast({
          title: "Wine Eliminated",
          description: data.reason,
        });
      } else {
        toast({
          title: "Cannot Eliminate",
          description: data.reason,
          variant: "destructive",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/blind-tasting/current"] });
    },
  });

  const advanceCluesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/blind-tasting/advance", "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blind-tasting/current"] });
      toast({
        title: "Next Clue Revealed",
        description: "Use the new information to eliminate more wines",
      });
    },
  });

  const completeSessionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/blind-tasting/complete", "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blind-tasting/current"] });
      toast({
        title: "Session Complete!",
        description: "Great work on identifying the wine!",
      });
    },
  });

  const handleStartSession = () => {
    setCheckedWines(new Set());
    startSessionMutation.mutate();
  };

  const handleWineToggle = (wineId: string, checked: boolean) => {
    const newChecked = new Set(checkedWines);
    if (!checked) {
      newChecked.add(wineId);
      // Wine is being unchecked (eliminated)
      eliminateMutation.mutate(wineId);
    } else {
      newChecked.delete(wineId);
    }
    setCheckedWines(newChecked);
  };

  const renderClue = (stage: number, targetWine: TastingNote) => {
    if (stage === 0) {
      return (
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
      );
    } else if (stage === 1) {
      return (
        <div className="space-y-3">
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
      );
    } else {
      return (
        <div className="space-y-3">
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
      );
    }
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
              {renderClue(session.currentClueStage, targetWine)}
              
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
                Uncheck wines to eliminate them
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 md:p-4 pt-0">
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {allWines.map((wine) => {
                  const isEliminated = session.eliminatedWines.includes(wine.id);
                  const isChecked = !isEliminated && !checkedWines.has(wine.id);
                  
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
                        disabled={isEliminated || eliminateMutation.isPending}
                        onCheckedChange={(checked) => 
                          handleWineToggle(wine.id, checked as boolean)
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
