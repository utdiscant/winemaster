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

  const uploadMutation = useMutation<{ success: boolean; count: number }, Error, JsonUpload>({
    mutationFn: async (data: JsonUpload) => {
      return await apiRequest("POST", "/api/questions/upload", data);
    },
    onSuccess: (response) => {
      toast({
        title: "Success!",
        description: `${response.count} ${response.count === 1 ? 'question' : 'questions'} imported successfully.`,
      });
      setUploadedData(null);
      setPastedJson("");
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quiz/due"] });
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
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
        data.questions = data.questions.map((q: any) => {
          const normalized = { ...q };
          // Accept both 'type' and 'questionType' fields
          if (q.questionType && !q.type) {
            normalized.type = q.questionType;
            delete normalized.questionType;
          }
          return normalized;
        });
      }
      
      setUploadedData(data);
    } catch (error) {
      toast({
        title: "Invalid JSON",
        description: "The pasted content is not valid JSON.",
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
      "options": ["Piedmont, Italy", "Tuscany, Italy", "Bordeaux, France", "Rioja, Spain"],
      "correctAnswer": 0,
      "category": "Italian Wines"
    }
  ]
}'
              value={pastedJson}
              onChange={(e) => setPastedJson(e.target.value)}
              className="font-mono text-sm min-h-[200px]"
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
                  const correctSet = new Set(isMulti ? (q as any).correctAnswers : [q.correctAnswer]);
                  
                  return (
                    <div key={i} className="p-4 rounded-lg bg-card border border-card-border" data-testid={`preview-question-${i}`}>
                      <div className="flex items-start justify-between mb-2">
                        <p className="font-medium flex-1">{q.question}</p>
                        <Badge variant={isMulti ? "secondary" : "default"} className="ml-2">
                          {isMulti ? 'Multi-Select' : 'Single Choice'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {q.options.map((opt, j) => (
                          <div
                            key={j}
                            className={`text-sm p-2 rounded border ${correctSet.has(j) ? "border-green-500 bg-green-50 dark:bg-green-950/30" : "border-border"}`}
                          >
                            {String.fromCharCode(65 + j)}. {opt}
                            {correctSet.has(j) && (
                              <span className="ml-1 text-xs text-green-600 dark:text-green-400">✓</span>
                            )}
                          </div>
                        ))}
                      </div>
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
              Supports two question types: <strong>Single Choice</strong> (4 options) and <strong>Multi-Select</strong> (6 options)
            </p>
            
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Single Choice Format:</p>
                <pre className="p-4 rounded-lg bg-muted text-sm overflow-x-auto">
{`{
  "question": "Which region is Barolo from?",
  "type": "single",
  "options": ["Piedmont, Italy", "Tuscany, Italy", 
              "Bordeaux, France", "Rioja, Spain"],
  "correctAnswer": 0,
  "category": "Italian Wines"
}`}
                </pre>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Multi-Select Format:</p>
                <pre className="p-4 rounded-lg bg-muted text-sm overflow-x-auto">
{`{
  "question": "Which are red grape varieties?",
  "type": "multi",
  "options": ["Cabernet Sauvignon", "Chardonnay",
              "Merlot", "Riesling", "Pinot Noir", "Sauvignon Blanc"],
  "correctAnswers": [0, 2, 4],
  "category": "Grape Varieties"
}`}
                </pre>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/50 border border-accent-border mt-4">
              <AlertCircle className="w-5 h-5 text-accent-foreground shrink-0 mt-0.5" />
              <div className="text-sm text-accent-foreground">
                <p className="font-medium">Requirements:</p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li><strong>Single Choice:</strong> 4 options, correctAnswer is index (0-3)</li>
                  <li><strong>Multi-Select:</strong> 6 options, correctAnswers is array of indices (0-5)</li>
                  <li>Type defaults to "single" if not specified</li>
                  <li>Multi-select can have 0-6 correct answers</li>
                  <li>Category is optional for both types</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
