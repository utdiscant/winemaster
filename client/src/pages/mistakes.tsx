import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Download, Wine } from "lucide-react";
import type { GivenAnswer, Mistake } from "@shared/schema";

const PERIODS = [7, 14, 30];

function describeAnswer(answer: GivenAnswer | null): string {
  if (!answer) return "I don't know";
  if (answer.options) return answer.options.length > 0 ? answer.options.join("; ") : "(nothing selected)";
  if (answer.mapClick) return `a point on the map (${answer.mapClick.lat.toFixed(2)}, ${answer.mapClick.lng.toFixed(2)})`;
  return answer.text || "(blank)";
}

function groupByCategory(mistakes: Mistake[]): [string, Mistake[]][] {
  const groups = new Map<string, Mistake[]>();
  for (const m of mistakes) {
    const key = m.category ?? "Uncategorized";
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return Array.from(groups).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

// A Markdown file of the period's mistakes, to study from or hand to an AI to write a study guide
function studyGuideMarkdown(mistakes: Mistake[], days: number): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    `# WSET mistakes: last ${days} days (to ${today})`,
    "",
    `${mistakes.length} questions answered wrong or marked "I don't know", grouped by textbook chapter.`,
    "Tip: paste this into Claude and ask for a study guide that explains the underlying topics and how they connect.",
  ];
  for (const [category, items] of groupByCategory(mistakes)) {
    lines.push("", `## ${category} (${items.length})`);
    for (const m of items) {
      lines.push(
        "",
        `### ${m.question}`,
        `- Correct answer: ${m.correctAnswers.join("; ")}`,
        `- My last answer: ${m.wrongCount > 0 ? describeAnswer(m.lastAnswer) : "I don't know"}`,
        `- Missed ${m.wrongCount + m.dontKnowCount}× in this period${m.correctSince ? ", answered correctly since" : ""}`,
      );
      if (m.explanation) lines.push(`- Why: ${m.explanation}`);
    }
  }
  return lines.join("\n") + "\n";
}

export default function MistakesPage() {
  const [days, setDays] = useState(7);
  const { data: mistakes, isLoading } = useQuery<Mistake[]>({
    queryKey: [`/api/mistakes?days=${days}`],
    staleTime: 0,
    refetchOnMount: "always",
  });

  const download = () => {
    if (!mistakes) return;
    const blob = new Blob([studyGuideMarkdown(mistakes, days)], { type: "text/markdown" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `wset-mistakes-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const stillOpen = mistakes?.filter((m) => !m.correctSince).length ?? 0;

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-serif font-semibold">Mistakes</h1>
            <p className="text-muted-foreground">
              Questions you answered wrong or didn't know, with the theory behind each answer.
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-[150px]" data-testid="select-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p} value={String(p)}>Last {p} days</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={download} disabled={!mistakes || mistakes.length === 0} data-testid="button-download-study-guide">
              <Download className="w-4 h-4 mr-2" />
              Study guide
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-16">
            <Wine className="w-12 h-12 text-primary mx-auto animate-pulse" />
          </div>
        ) : !mistakes || mistakes.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No mistakes in the last {days} days.
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="text-sm text-muted-foreground" data-testid="text-mistake-summary">
              {mistakes.length} {mistakes.length === 1 ? "question" : "questions"} missed, {stillOpen} not yet answered
              correctly since. "Study guide" downloads them as a Markdown file you can study from or paste into Claude.
            </p>
            {groupByCategory(mistakes).map(([category, items]) => (
              <Card key={category}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-xl font-serif">
                    {category} <span className="text-muted-foreground font-sans text-base">({items.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {items.map((m) => (
                    <div key={m.questionId} className="rounded-lg border border-border p-4 space-y-2" data-testid={`mistake-${m.questionId}`}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium">{m.question}</p>
                        <div className="flex gap-1 shrink-0">
                          <Badge variant="outline">{m.wrongCount + m.dontKnowCount}× missed</Badge>
                          {m.correctSince && <Badge variant="secondary" className="text-green-700 dark:text-green-400">Correct since</Badge>}
                        </div>
                      </div>
                      {m.correctAnswers.length > 1 && m.questionType === "multi" ? (
                        <div className="text-sm">
                          <span className="text-green-700 dark:text-green-400 font-medium">Answers:</span>
                          <ul className="list-disc pl-5 mt-1 space-y-0.5">
                            {m.correctAnswers.map((answer) => <li key={answer}>{answer}</li>)}
                          </ul>
                        </div>
                      ) : (
                        <p className="text-sm">
                          <span className="text-green-700 dark:text-green-400 font-medium">Answer: </span>
                          {m.correctAnswers.join(" / ")}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        You answered: {m.wrongCount > 0 ? describeAnswer(m.lastAnswer) : "I don't know"}
                      </p>
                      {m.explanation && (
                        <div className="flex gap-2 rounded-md bg-muted/50 p-3">
                          <BookOpen className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <p className="text-sm leading-relaxed">{m.explanation}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
