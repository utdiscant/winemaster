import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { BookOpen, CheckCircle2, ClipboardCheck, ExternalLink, PlayCircle, Wine, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  EXAM_PASS_PERCENT,
  type ExamAttempt,
  type ExamPaperQuestion,
  type ExamResult,
  type User,
} from "@shared/schema";

type ExamInfo = { bankSize: number; available: number; attempts: ExamAttempt[] };

const LETTERS = ["a", "b", "c", "d"];

// The overall grade the real exam gives for an aggregate mark (here only the multiple-choice part)
function gradeFor(percent: number): string {
  if (percent >= 80) return "Distinction level";
  if (percent >= 65) return "Merit level";
  if (percent >= EXAM_PASS_PERCENT) return "Pass";
  return "Fail";
}

function Setup({ onStart }: { onStart: (questions: ExamPaperQuestion[]) => void }) {
  const { toast } = useToast();
  const { data: user } = useQuery<User | null>({ queryKey: ["/api/auth/user"] });
  const { data: info, isLoading } = useQuery<ExamInfo>({ queryKey: ["/api/exam/info"], staleTime: 0, refetchOnMount: "always" });
  const [count, setCount] = useState("50");
  const [onlyStudying, setOnlyStudying] = useState(true);
  const pausedCount = user?.pausedCategories?.length ?? 0;

  const startMutation = useMutation({
    mutationFn: (body: { count: number; onlyStudying: boolean }) =>
      apiRequest<{ questions: ExamPaperQuestion[] }>("POST", "/api/exam/start", body),
    onSuccess: (data) => onStart(data.questions),
    onError: (error: Error) => toast({ title: "Couldn't start the exam", description: error.message, variant: "destructive" }),
  });

  if (isLoading || !info) {
    return <div className="text-center py-16"><Wine className="w-12 h-12 text-primary mx-auto animate-pulse" /></div>;
  }
  if (info.bankSize === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          There are no exam questions yet. An admin can upload the exam bank on the Upload page.
        </CardContent>
      </Card>
    );
  }

  const max = Math.min(200, onlyStudying && pausedCount > 0 ? info.available : info.bankSize);
  const n = Number(count);
  const valid = Number.isInteger(n) && n >= 1 && n <= max;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-serif">Start a mock exam</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-muted-foreground">
            Like Part 1 of the real WSET Level 3 theory exam: multiple-choice questions with one correct answer each,
            drawn in the real exam's proportions (of 50: 28 on still wines of the world, 8 on vineyard and winery,
            5 sparkling, 5 fortified, 4 on storage, service and food). The pass mark is {EXAM_PASS_PERCENT}%. The real
            theory exam gives 2 hours for its 50 questions and the written part together.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="exam-count">Number of questions</Label>
              <Input
                id="exam-count"
                type="number"
                min={1}
                max={max}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="w-32"
                data-testid="input-exam-count"
              />
            </div>
            <Button
              size="lg"
              disabled={!valid || startMutation.isPending}
              onClick={() => startMutation.mutate({ count: n, onlyStudying })}
              data-testid="button-start-exam"
            >
              <ClipboardCheck className="w-4 h-4 mr-2" />
              {startMutation.isPending ? "Preparing…" : "Start exam"}
            </Button>
          </div>
          {!valid && <p className="text-sm text-destructive">Choose a number from 1 to {max}.</p>}
          {pausedCount > 0 && (
            <div className="flex items-center gap-3">
              <Checkbox id="only-studying" checked={onlyStudying} onCheckedChange={(v) => setOnlyStudying(v === true)} />
              <label htmlFor="only-studying" className="text-sm cursor-pointer">
                Leave out my {pausedCount} paused {pausedCount === 1 ? "chapter" : "chapters"} ({info.available} of {info.bankSize} questions available)
              </label>
            </div>
          )}
        </CardContent>
      </Card>

      {info.attempts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-serif">Previous exams</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {info.attempts.map((a) => {
                const percent = Math.round((a.correctCount / a.total) * 100);
                return (
                  <div key={a.id} className="flex items-center justify-between py-2 text-sm" data-testid={`exam-attempt-${a.id}`}>
                    <span className="text-muted-foreground">
                      {new Date(a.takenAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                    <span className="flex items-center gap-3">
                      <span>{a.correctCount} / {a.total}</span>
                      <Badge variant={percent >= EXAM_PASS_PERCENT ? "default" : "outline"}>{percent}%</Badge>
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Paper({ questions, onSubmitted }: { questions: ExamPaperQuestion[]; onSubmitted: (result: ExamResult) => void }) {
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const answered = Object.keys(answers).length;

  // Warn before leaving the page mid-exam
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const submitMutation = useMutation({
    mutationFn: () => apiRequest<ExamResult>("POST", "/api/exam/submit", {
      answers: questions.map((q) => ({ questionId: q.id, choice: answers[q.id] ?? null })),
    }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/exam/info"] });
      onSubmitted(result);
      window.scrollTo({ top: 0 });
    },
    onError: (error: Error) => toast({ title: "Couldn't submit", description: error.message, variant: "destructive" }),
  });

  const submit = () => {
    const blank = questions.length - answered;
    if (blank > 0 && !window.confirm(`${blank} ${blank === 1 ? "question is" : "questions are"} unanswered. Submit anyway?`)) return;
    submitMutation.mutate();
  };

  return (
    <div className="space-y-4 pb-24">
      {questions.map((q, i) => (
        <Card key={q.id} data-testid={`exam-question-${i + 1}`}>
          <CardContent className="pt-5 space-y-3">
            <p className="font-medium">
              <span className="text-muted-foreground mr-2">{i + 1}.</span>
              {q.question}
            </p>
            <div className="grid gap-2">
              {q.options.map((option, j) => {
                const selected = answers[q.id] === j;
                return (
                  <button
                    key={j}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: j }))}
                    className={`flex items-start gap-3 rounded-lg border-2 p-3 text-left transition-colors ${
                      selected ? "border-primary bg-primary/5" : "border-border hover-elevate"
                    }`}
                    data-testid={`exam-option-${i + 1}-${LETTERS[j]}`}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                      {LETTERS[j]}
                    </span>
                    <span className="text-sm md:text-base">{option}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-4">
          <div className="flex-1 space-y-1">
            <p className="text-sm text-muted-foreground" data-testid="text-exam-answered">Answered {answered} of {questions.length}</p>
            <Progress value={(answered / questions.length) * 100} className="h-1.5" />
          </div>
          <Button onClick={submit} disabled={submitMutation.isPending} data-testid="button-submit-exam">
            {submitMutation.isPending ? "Marking…" : "Submit exam"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Results({ result, onRestart }: { result: ExamResult; onRestart: () => void }) {
  const missed = result.questions.filter((q) => !q.isCorrect);
  return (
    <div className="space-y-6">
      <Card className={result.passed ? "border-green-600" : "border-amber-600"}>
        <CardContent className="pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {result.passed
              ? <CheckCircle2 className="w-10 h-10 text-green-600 shrink-0" />
              : <XCircle className="w-10 h-10 text-amber-600 shrink-0" />}
            <div>
              <p className="text-3xl font-bold" data-testid="text-exam-score">{result.percent}%</p>
              <p className="text-muted-foreground">
                {result.correctCount} of {result.total} correct · {gradeFor(result.percent)} (pass mark {EXAM_PASS_PERCENT}%)
              </p>
            </div>
          </div>
          <Button onClick={onRestart} data-testid="button-new-exam">New exam</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xl font-serif">By part of the syllabus</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {result.byLearningOutcome.map((l) => (
            <div key={l.lo} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{l.name}</span>
                <span className="text-muted-foreground">{l.correct} / {l.total}</span>
              </div>
              <Progress value={(l.correct / l.total) * 100} className="h-1.5" />
            </div>
          ))}
        </CardContent>
      </Card>

      {result.recommendedVideos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-serif flex items-center gap-2">
              <PlayCircle className="w-5 h-5 text-primary" />
              Videos to watch
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Wine With Jimmy videos covering the {missed.length} {missed.length === 1 ? "question" : "questions"} you missed, most useful first.
            </p>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {result.recommendedVideos.map((v) => (
              <a
                key={v.id}
                href={v.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-start justify-between gap-3 py-3 hover:text-primary"
                data-testid={`video-${v.id}`}
              >
                <div>
                  <p className="font-medium">{v.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {v.section}{v.duration ? ` · ${v.duration}` : ""} · questions {v.questionNumbers.join(", ")}
                  </p>
                </div>
                <ExternalLink className="w-4 h-4 shrink-0 mt-1" />
              </a>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <h2 className="text-2xl font-serif font-semibold">Answers</h2>
        {result.questions.map((q) => (
          <Card key={q.id} className={q.isCorrect ? "" : "border-amber-500"} data-testid={`exam-result-${q.number}`}>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">
                  <span className="text-muted-foreground mr-2">{q.number}.</span>
                  {q.question}
                </p>
                <Badge variant="outline" className="shrink-0">{q.category}</Badge>
              </div>
              <div className="grid gap-1.5">
                {q.options.map((option, j) => {
                  const isAnswer = j === q.correct;
                  const isChoice = j === q.choice;
                  return (
                    <div
                      key={j}
                      className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
                        isAnswer ? "bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-300 font-medium"
                          : isChoice ? "bg-destructive/10 text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      <span className="w-4">{LETTERS[j]}</span>
                      <span className="flex-1">{option}</span>
                      {isAnswer && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                      {isChoice && !isAnswer && <XCircle className="w-4 h-4 shrink-0" />}
                    </div>
                  );
                })}
                {q.choice === null && <p className="text-xs text-muted-foreground px-3">Not answered</p>}
              </div>
              {q.explanation && (
                <div className="flex gap-2 rounded-md bg-muted/50 p-3">
                  <BookOpen className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-sm leading-relaxed">{q.explanation}</p>
                </div>
              )}
              {!q.isCorrect && q.videos.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Watch:{" "}
                  {q.videos.map((v, k) => (
                    <span key={v.id}>
                      {k > 0 && " · "}
                      <a href={v.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-primary">{v.title}</a>
                    </span>
                  ))}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function ExamPage() {
  const [paper, setPaper] = useState<ExamPaperQuestion[] | null>(null);
  const [result, setResult] = useState<ExamResult | null>(null);

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-serif font-semibold">Mock exam</h1>
          {paper && !result && (
            <p className="text-muted-foreground">{paper.length} questions · one correct answer each</p>
          )}
        </div>
        {result ? (
          <Results result={result} onRestart={() => { setResult(null); setPaper(null); }} />
        ) : paper ? (
          <Paper questions={paper} onSubmitted={setResult} />
        ) : (
          <Setup onStart={setPaper} />
        )}
      </div>
    </div>
  );
}
