import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileJson, CheckCircle2, AlertCircle, Wine, Code } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { JsonUpload } from "@shared/schema";

export default function UploadPage() {
  const { toast } = useToast();
  const [dragActive, setDragActive] = useState(false);
  const [uploadedData, setUploadedData] = useState<JsonUpload | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [pastedJson, setPastedJson] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation<{ count: number }, Error, JsonUpload>({
    mutationFn: async (data: JsonUpload) => {
      return await apiRequest("POST", "/api/questions/upload", data);
    },
    onSuccess: (response) => {
      toast({
        title: "Success!",
        description: `${response.count} questions imported successfully.`,
      });
      setUploadedData(null);
      setFileName("");
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quiz/due"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".json")) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a JSON file.",
        variant: "destructive",
      });
      return;
    }

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        // If JSON is an array, wrap it in { questions: array }
        const data = Array.isArray(json) ? { questions: json } : json;
        setUploadedData(data);
      } catch (error) {
        toast({
          title: "Invalid JSON",
          description: "The file contains invalid JSON data.",
          variant: "destructive",
        });
        setFileName("");
      }
    };
    reader.readAsText(file);
  };

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
      const data = Array.isArray(json) ? { questions: json } : json;
      setUploadedData(data);
      setFileName("Pasted JSON");
    } catch (error) {
      toast({
        title: "Invalid JSON",
        description: "The pasted content is not valid JSON.",
        variant: "destructive",
      });
    }
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
            Import wine questions from a JSON file to expand your study deck
          </p>
        </div>

        {/* Upload Methods */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* File Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-serif flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Upload File
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`
                  relative border-2 border-dashed rounded-lg p-8 text-center transition-all
                  ${dragActive ? "border-primary bg-primary/5" : "border-border"}
                  hover-elevate cursor-pointer
                `}
                onClick={() => fileInputRef.current?.click()}
                data-testid="dropzone-upload"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleChange}
                  className="hidden"
                  data-testid="input-file"
                />
                <div className="space-y-3">
                  <Upload className={`w-12 h-12 mx-auto ${dragActive ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="space-y-1">
                    <p className="font-medium">
                      {dragActive ? "Drop here" : "Drop or click"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Upload a JSON file
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Paste JSON */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-serif flex items-center gap-2">
                <Code className="w-5 h-5" />
                Paste JSON
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder='{"questions": [...]}'
                value={pastedJson}
                onChange={(e) => setPastedJson(e.target.value)}
                className="font-mono text-sm min-h-[160px]"
                data-testid="textarea-json"
              />
              <Button
                onClick={handlePasteJson}
                variant="secondary"
                className="w-full"
                data-testid="button-parse-json"
              >
                Parse JSON
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* File Status */}
        {fileName && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-accent/50 border border-accent-border">
                <FileJson className="w-5 h-5 text-accent-foreground" />
                <span className="flex-1 font-medium text-accent-foreground" data-testid="text-filename">
                  {fileName}
                </span>
                {uploadedData && <CheckCircle2 className="w-5 h-5 text-green-600" />}
              </div>
            </CardContent>
          </Card>
        )}

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
                {uploadedData.questions.slice(0, 3).map((q, i) => (
                  <div key={i} className="p-4 rounded-lg bg-card border border-card-border" data-testid={`preview-question-${i}`}>
                    <p className="font-medium mb-2">{q.question}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {q.options.map((opt, j) => (
                        <div
                          key={j}
                          className={`text-sm p-2 rounded border ${j === q.correctAnswer ? "border-green-500 bg-green-50 dark:bg-green-950/30" : "border-border"}`}
                        >
                          {String.fromCharCode(65 + j)}. {opt}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
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
            <p className="text-muted-foreground">
              Your JSON file should follow this structure:
            </p>
            <pre className="p-4 rounded-lg bg-muted text-sm overflow-x-auto" data-testid="code-format-example">
{`{
  "questions": [
    {
      "question": "Which region is Barolo from?",
      "options": [
        "Piedmont, Italy",
        "Tuscany, Italy",
        "Bordeaux, France",
        "Rioja, Spain"
      ],
      "correctAnswer": 0,
      "category": "Italian Wines"
    }
  ]
}`}
            </pre>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/50 border border-accent-border">
              <AlertCircle className="w-5 h-5 text-accent-foreground shrink-0 mt-0.5" />
              <div className="text-sm text-accent-foreground">
                <p className="font-medium">Requirements:</p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Each question must have exactly 4 options</li>
                  <li>correctAnswer is the index (0-3) of the correct option</li>
                  <li>category is optional</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
