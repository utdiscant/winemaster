import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Settings, Edit2, Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Question } from "@shared/schema";

export default function AdminPage() {
  const { toast } = useToast();
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    question: "",
    option1: "",
    option2: "",
    option3: "",
    option4: "",
    correctAnswer: 0,
    category: "",
  });

  // Fetch all questions
  const { data: questions, isLoading } = useQuery<Question[]>({
    queryKey: ["/api/questions"],
  });

  // Update question mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<Question> }) => {
      return await apiRequest("PATCH", `/api/questions/${data.id}`, data.updates);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Question updated successfully",
      });
      setEditingQuestion(null);
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete question mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/questions/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Question deleted successfully",
      });
      setDeletingQuestionId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quiz/due"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Populate form when editing
  useEffect(() => {
    if (editingQuestion) {
      setFormData({
        question: editingQuestion.question,
        option1: editingQuestion.options[0] || "",
        option2: editingQuestion.options[1] || "",
        option3: editingQuestion.options[2] || "",
        option4: editingQuestion.options[3] || "",
        correctAnswer: editingQuestion.correctAnswer,
        category: editingQuestion.category || "",
      });
    }
  }, [editingQuestion]);

  const handleSave = () => {
    if (!editingQuestion) return;

    const updates = {
      question: formData.question,
      options: [
        formData.option1,
        formData.option2,
        formData.option3,
        formData.option4,
      ],
      correctAnswer: formData.correctAnswer,
      category: formData.category || undefined,
    };

    updateMutation.mutate({ id: editingQuestion.id, updates });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading questions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="w-8 h-8 text-primary" />
          <h1 className="text-4xl font-serif font-semibold">Question Management</h1>
        </div>
        <p className="text-muted-foreground">
          Manage all questions in the system. Edit or delete existing questions.
        </p>
      </div>

      <div className="grid gap-4">
        {questions && questions.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No questions found. Upload some questions to get started.
              </p>
            </CardContent>
          </Card>
        )}

        {questions?.map((question) => (
          <Card key={question.id} data-testid={`card-question-${question.id}`}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <CardTitle className="text-lg mb-2">{question.question}</CardTitle>
                  {question.category && (
                    <p className="text-sm text-muted-foreground">Category: {question.category}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setEditingQuestion(question)}
                    data-testid={`button-edit-${question.id}`}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setDeletingQuestionId(question.id)}
                    data-testid={`button-delete-${question.id}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {question.options.map((option, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${
                      index === question.correctAnswer
                        ? "bg-green-50 dark:bg-green-950/20 border-green-500"
                        : "bg-muted/50"
                    }`}
                  >
                    <span className="font-medium mr-2">
                      {String.fromCharCode(65 + index)}.
                    </span>
                    {option}
                    {index === question.correctAnswer && (
                      <span className="ml-2 text-sm text-green-600 dark:text-green-400">
                        (Correct)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingQuestion} onOpenChange={(open) => !open && setEditingQuestion(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Question</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="question">Question</Label>
              <Textarea
                id="question"
                value={formData.question}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                rows={3}
                data-testid="input-edit-question"
              />
            </div>

            <div>
              <Label htmlFor="option1">Option A</Label>
              <Input
                id="option1"
                value={formData.option1}
                onChange={(e) => setFormData({ ...formData, option1: e.target.value })}
                data-testid="input-edit-option1"
              />
            </div>

            <div>
              <Label htmlFor="option2">Option B</Label>
              <Input
                id="option2"
                value={formData.option2}
                onChange={(e) => setFormData({ ...formData, option2: e.target.value })}
                data-testid="input-edit-option2"
              />
            </div>

            <div>
              <Label htmlFor="option3">Option C</Label>
              <Input
                id="option3"
                value={formData.option3}
                onChange={(e) => setFormData({ ...formData, option3: e.target.value })}
                data-testid="input-edit-option3"
              />
            </div>

            <div>
              <Label htmlFor="option4">Option D</Label>
              <Input
                id="option4"
                value={formData.option4}
                onChange={(e) => setFormData({ ...formData, option4: e.target.value })}
                data-testid="input-edit-option4"
              />
            </div>

            <div>
              <Label htmlFor="correctAnswer">Correct Answer</Label>
              <select
                id="correctAnswer"
                value={formData.correctAnswer}
                onChange={(e) => setFormData({ ...formData, correctAnswer: parseInt(e.target.value) })}
                className="w-full p-2 border rounded-md"
                data-testid="select-edit-correct-answer"
              >
                <option value={0}>A</option>
                <option value={1}>B</option>
                <option value={2}>C</option>
                <option value={3}>D</option>
              </select>
            </div>

            <div>
              <Label htmlFor="category">Category (Optional)</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Bordeaux, Italian Wines"
                data-testid="input-edit-category"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingQuestion(null)}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletingQuestionId}
        onOpenChange={(open) => !open && setDeletingQuestionId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Question?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this question and all associated review cards for all users. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingQuestionId && handleDelete(deletingQuestionId)}
              className="bg-destructive text-destructive-foreground"
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
