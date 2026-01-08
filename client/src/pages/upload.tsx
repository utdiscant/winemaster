import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Code } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { JsonUpload } from "@shared/schema";

export default function UploadPage() {
  const { toast } = useToast();
  const [uploadedData, setUploadedData] = useState<JsonUpload | null>(null);
  const [pastedJson, setPastedJson] = useState<string>("");

  const uploadMutation = useMutation<{ success: boolean; created: number; updated: number; total: number }, Error, JsonUpload>({
    mutationFn: async (data: JsonUpload) => {
      return await apiRequest("POST", "/api/questions/upload", data);
    },
    onSuccess: (response) => {
      const parts = [];
      if (response.created > 0) {
        parts.push(`${response.created} created`);
      }
      if (response.updated > 0) {
        parts.push(`${response.updated} updated (progress cleared)`);
      }
      const description = parts.length > 0 
        ? parts.join(', ') + ` - ${response.total} total`
        : `${response.total} ${response.total === 1 ? 'question' : 'questions'} imported successfully.`;
      
      toast({
        title: "Success!",
        description,
      });
      setUploadedData(null);
      setPastedJson("");
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      // Invalidate all quiz/due queries including curriculum-specific ones
      queryClient.invalidateQueries({ queryKey: ["/api/quiz/due"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/progress/cards"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePasteJson = () => {
    if (!pastedJson.trim()) {
      toast({
        title: "Empty Input",
        description: "Please paste JSON content.",
        variant: "destructive",
      });
      return;
    }

    try {
      const json = JSON.parse(pastedJson);
      // If JSON is an array, wrap it in { questions: array }
      let data = Array.isArray(json) ? { questions: json } : json;

      // Normalize questionType to type for backend compatibility
      if (data.questions) {
        data.questions = data.questions.map((q: any, index: number) => {
          const normalized = { ...q };

          // Accept both 'type' and 'questionType' fields
          if (q.questionType && !q.type) {
            normalized.type = q.questionType;
            delete normalized.questionType;
          }

          // Set default type to 'single' if not specified
          if (!normalized.type) {
            normalized.type = 'single';
          }

          // For map and text-input questions: normalize 'options' to 'acceptedAnswers' if needed
          if ((normalized.type === 'map' || normalized.type === 'text-input') && !normalized.acceptedAnswers && normalized.options) {
            normalized.acceptedAnswers = normalized.options;
            delete normalized.options;
          }

          // Basic validation to catch common issues early
          const qType = normalized.type;

          const questionPreview = normalized.question ?
            normalized.question.substring(0, 50) + (normalized.question.length > 50 ? '...' : '') :
            'No question text';

          if (qType === 'single') {
            if (!normalized.options || normalized.options.length !== 4) {
              throw new Error(`Question ${index + 1} ("${questionPreview}"): Single-choice questions must have exactly 4 options. Found: ${normalized.options?.length || 0} options`);
            }
            if (normalized.correctAnswer === undefined || normalized.correctAnswer < 0 || normalized.correctAnswer > 3) {
              throw new Error(`Question ${index + 1} ("${questionPreview}"): Single-choice questions must have correctAnswer (0-3). Found: ${normalized.correctAnswer}`);
            }
          } else if (qType === 'multi') {
            if (!normalized.options || normalized.options.length !== 6) {
              throw new Error(`Question ${index + 1} ("${questionPreview}"): Multi-select questions must have exactly 6 options. Found: ${normalized.options?.length || 0} options`);
            }
            if (!Array.isArray(normalized.correctAnswers)) {
              throw new Error(`Question ${index + 1} ("${questionPreview}"): Multi-select questions must have correctAnswers array`);
            }
          } else if (qType === 'text-input') {
            if (!normalized.acceptedAnswers || !Array.isArray(normalized.acceptedAnswers) || normalized.acceptedAnswers.length === 0) {
              throw new Error(`Question ${index + 1} ("${questionPreview}"): Text-input questions must have acceptedAnswers array with at least 1 answer`);
            }
          } else if (qType === 'map') {
            if (!normalized.regionName) {
              throw new Error(`Question ${index + 1} ("${questionPreview}"): Map questions must have regionName field`);
            }
            if (!normalized.regionPolygon) {
              throw new Error(`Question ${index + 1} ("${questionPreview}"): Map questions must have regionPolygon field (GeoJSON)`);
            }
            if (!normalized.acceptedAnswers || !Array.isArray(normalized.acceptedAnswers) || normalized.acceptedAnswers.length === 0) {
              throw new Error(`Question ${index + 1} ("${questionPreview}"): Map questions must have acceptedAnswers array with at least 1 answer`);
            }
          } else {
            throw new Error(`Question ${index + 1} ("${questionPreview}"): Unknown question type "${qType}". Must be 'single', 'multi', 'text-input', or 'map'`);
          }

          return normalized;
        });
      }

      setUploadedData(data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "The pasted content is not valid JSON.";
      toast({
        title: "Invalid JSON",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleClear = () => {
    setPastedJson("");
    setUploadedData(null);
  };

  const handleImport = () => {
    if (uploadedData) {
      uploadMutation.mutate(uploadedData);
    }
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl font-serif font-semibold" data-testid="text-page-title">
            Upload Questions
          </h1>
          <p className="text-muted-foreground text-lg">
            Import wine questions by pasting JSON content to expand your study deck
          </p>
        </div>

        {/* Paste JSON Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-serif flex items-center gap-2">
              <Code className="w-5 h-5" />
              Paste JSON Content
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder='Paste your JSON here... 
Example:
{
  "questions": [
    {
      "question": "Which region is Barolo from?",
      "type": "single",
      "options": ["Piedmont, Italy", "Tuscany, Italy", "Bordeaux, France", "Rioja, Spain"],
      "correctAnswer": 0,
      "category": "Italian Wines",
      "curriculum": "WSET2"
    },
    {
      "question": "Which are red grape varieties?",
      "type": "multi",
      "options": ["Cabernet Sauvignon", "Chardonnay", "Merlot", "Riesling", "Pinot Noir", "Sauvignon Blanc"],
      "correctAnswers": [0, 2, 4],
      "category": "Grape Varieties",
      "curriculum": "WSET2"
    },
    {
      "question": "What is the primary grape variety used in Champagne?",
      "type": "text-input",
      "acceptedAnswers": ["Chardonnay", "Pinot Noir", "Pinot Meunier"],
      "category": "French Wines",
      "curriculum": "WSET2"
    },
    {
      "question": "Identify the Bordeaux region",
      "type": "map",
      "regionName": "Bordeaux",
      "regionPolygon": {"type":"Polygon","coordinates":[[[-1.0,45.0],[-0.5,45.0],[-0.5,44.5],[-1.0,44.5],[-1.0,45.0]]]},
      "options": ["Bordeaux"],
      "category": "French Regions"
    }
  ]
}'
              value={pastedJson}
              onChange={(e) => setPastedJson(e.target.value)}
              className="font-mono text-sm min-h-[300px]"
              data-testid="textarea-json"
            />
            <div className="flex gap-2">
              <Button
                onClick={handlePasteJson}
                className="flex-1"
                data-testid="button-parse-json"
              >
                Parse JSON
              </Button>
              <Button
                onClick={handleClear}
                variant="outline"
                data-testid="button-clear-json"
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Preview & Import */}
        {uploadedData && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-serif">Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                <div className="space-y-1">
                  <p className="font-medium">Questions Found</p>
                  <p className="text-sm text-muted-foreground">Ready to import</p>
                </div>
                <Badge variant="default" className="text-lg px-4 py-1" data-testid="badge-question-count">
                  {uploadedData.questions.length}
                </Badge>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Sample Questions:</p>
                {uploadedData.questions.slice(0, 3).map((q, i) => {
                  const isMulti = q.type === 'multi';
                  const isTextInput = q.type === 'text-input';
                  const isMap = q.type === 'map';
                  
                  return (
                    <div key={i} className="p-4 rounded-lg bg-card border border-card-border" data-testid={`preview-question-${i}`}>
                      <div className="flex items-start justify-between mb-2">
                        <p className="font-medium flex-1">{q.question}</p>
                        <Badge variant={
                          isMulti ? "secondary" : 
                          isTextInput || isMap ? "outline" : 
                          "default"
                        } className="ml-2">
                          {isMulti ? 'Multi-Select' : 
                           isTextInput ? 'Text Input' : 
                           isMap ? 'Map Region' : 
                           'Single Choice'}
                        </Badge>
                      </div>
                      {isTextInput || isMap ? (
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">
                            {isTextInput ? 'Accepted answers:' : 'Accepted region names:'}
                          </p>
                          <div className="space-y-1">
                            {(q as any).acceptedAnswers.map((ans: string, j: number) => (
                              <div key={j} className="text-sm p-2 rounded border border-green-500 bg-green-50 dark:bg-green-950/30">
                                {ans} <span className="ml-1 text-xs text-green-600 dark:text-green-400">✓</span>
                              </div>
                            ))}
                          </div>
                          {isMap && (q as any).regionName && (
                            <p className="text-sm text-muted-foreground mt-2">
                              Primary region: {(q as any).regionName}
                            </p>
                          )}
                          {isMap && (
                            <div className="text-xs text-muted-foreground p-2 rounded bg-muted">
                              Map polygon defined: {(q as any).regionPolygon ? 'Yes' : 'No'}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {(q as any).options.map((opt: string, j: number) => {
                            const correctSet = new Set(isMulti ? (q as any).correctAnswers : [(q as any).correctAnswer]);
                            return (
                              <div
                                key={j}
                                className={`text-sm p-2 rounded border ${correctSet.has(j) ? "border-green-500 bg-green-50 dark:bg-green-950/30" : "border-border"}`}
                              >
                                {String.fromCharCode(65 + j)}. {opt}
                                {correctSet.has(j) && (
                                  <span className="ml-1 text-xs text-green-600 dark:text-green-400">✓</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {uploadedData.questions.length > 3 && (
                  <p className="text-sm text-muted-foreground text-center">
                    ...and {uploadedData.questions.length - 3} more questions
                  </p>
                )}
              </div>

              <Button
                onClick={handleImport}
                disabled={uploadMutation.isPending}
                size="lg"
                className="w-full"
                data-testid="button-import"
              >
                {uploadMutation.isPending ? "Importing..." : `Import ${uploadedData.questions.length} Questions`}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* JSON Format Guide */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-serif">JSON Format Guide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground mb-2">
              Supports four question types: <strong>Single Choice</strong> (4 options), <strong>Multi-Select</strong> (6 options), <strong>Text Input</strong> (free text with accepted answers), and <strong>Map</strong> (randomly shows either click-to-identify or name-the-region)
            </p>
            
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Complete Example:</p>
                <pre className="p-4 rounded-lg bg-muted text-sm overflow-x-auto">
{`{
  "questions": [
    {
      "id": "barolo-region-001",
      "question": "Which region is Barolo from?",
      "type": "single",
      "options": ["Piedmont, Italy", "Tuscany, Italy", 
                  "Bordeaux, France", "Rioja, Spain"],
      "correctAnswer": 0,
      "category": "Italian Wines",
      "curriculum": "WSET2"
    },
    {
      "id": "red-grapes-001",
      "question": "Which are red grape varieties?",
      "type": "multi",
      "options": ["Cabernet Sauvignon", "Chardonnay",
                  "Merlot", "Riesling", "Pinot Noir", "Sauvignon Blanc"],
      "correctAnswers": [0, 2, 4],
      "category": "Grape Varieties",
      "curriculum": "WSET2"
    },
    {
      "id": "champagne-grapes-001",
      "question": "Name a grape variety used in Champagne",
      "type": "text-input",
      "acceptedAnswers": ["Chardonnay", "Pinot Noir", "Pinot Meunier"],
      "category": "French Wines",
      "curriculum": "WSET2"
    },
    {
      "id": "bordeaux-map-001",
      "question": "Identify the Bordeaux region",
      "type": "map",
      "regionName": "Bordeaux",
      "regionPolygon": {
        "type": "Polygon",
        "coordinates": [[
          [-1.0, 45.0], [-0.5, 45.0],
          [-0.5, 44.5], [-1.0, 44.5], [-1.0, 45.0]
        ]]
      },
      "options": ["Bordeaux"],
      "category": "French Regions",
      "curriculum": "WSET2"
    }
  ]
}`}
                </pre>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/50 border border-accent-border mt-4">
              <AlertCircle className="w-5 h-5 text-accent-foreground shrink-0 mt-0.5" />
              <div className="text-sm text-accent-foreground">
                <p className="font-medium">Requirements:</p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li><strong>ID field (optional):</strong> Unique identifier for upsert - if provided and exists, updates question and clears all user progress; if not provided, auto-generates new ID</li>
                  <li><strong>Single Choice:</strong> 4 options, correctAnswer is index (0-3)</li>
                  <li><strong>Multi-Select:</strong> 6 options, correctAnswers is array of indices (0-5)</li>
                  <li><strong>Text Input:</strong> acceptedAnswers (or options) is array of valid text answers (case-insensitive matching)</li>
                  <li><strong>Map:</strong> regionName (primary name), regionPolygon (GeoJSON Polygon), options or acceptedAnswers (region names for text matching) - randomly displays as either click-on-map or name-the-region during quiz</li>
                  <li>Type defaults to "single" if not specified</li>
                  <li>Multi-select can have 0-6 correct answers</li>
                  <li>Text input and map answers are matched case-insensitively with trimming</li>
                  <li>Map question regionPolygon must be valid GeoJSON Polygon or MultiPolygon format with coordinates in [longitude, latitude] order</li>
                  <li>Category and curriculum fields are optional for all types</li>
                  <li>Curriculum examples: "WSET1", "WSET2", "WSET3", etc.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
