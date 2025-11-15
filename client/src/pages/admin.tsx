import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Settings, Edit2, Trash2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Question } from "@shared/schema";

export default function AdminPage() {
  const { toast } = useToast();
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [curriculumFilter, setCurriculumFilter] = useState<string>("all");
  const [formData, setFormData] = useState({
    question: "",
    option1: "",
    option2: "",
    option3: "",
    option4: "",
    option5: "",
    option6: "",
    correctAnswer: 0,
    correctAnswers: [] as number[],
    category: "",
    curriculum: "",
    mapRegionName: "",
    mapCountry: "",
    mapLatitude: 0,
    mapLongitude: 0,
    mapZoom: 6,
    mapVariant: "location-to-name" as "location-to-name" | "name-to-location",
  });

  const ITEMS_PER_PAGE = 10;

  // Fetch all questions
  const { data: questions, isLoading } = useQuery<Question[]>({
    queryKey: ["/api/questions"],
  });

  // Get unique categories for filter
  const categories = useMemo(() => {
    if (!questions) return [];
    const uniqueCategories = new Set<string>();
    questions.forEach(q => {
      if (q.category) uniqueCategories.add(q.category);
    });
    return Array.from(uniqueCategories).sort();
  }, [questions]);

  // Get unique curriculums for filter
  const curriculums = useMemo(() => {
    if (!questions) return [];
    const uniqueCurriculums = new Set<string>();
    questions.forEach(q => {
      if (q.curriculum) uniqueCurriculums.add(q.curriculum);
    });
    return Array.from(uniqueCurriculums).sort();
  }, [questions]);

  // Filter and paginate questions
  const { filteredQuestions, totalPages, paginatedQuestions } = useMemo(() => {
    if (!questions) return { filteredQuestions: [], totalPages: 0, paginatedQuestions: [] };

    // Filter by search query
    let filtered = questions.filter(q => {
      const matchesSearch = searchQuery === "" || 
        q.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (q.options && q.options.some(opt => opt.toLowerCase().includes(searchQuery.toLowerCase())));
      
      const matchesCategory = categoryFilter === "all" || q.category === categoryFilter;
      const matchesCurriculum = curriculumFilter === "all" || q.curriculum === curriculumFilter;
      
      return matchesSearch && matchesCategory && matchesCurriculum;
    });

    const total = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    return {
      filteredQuestions: filtered,
      totalPages: total,
      paginatedQuestions: paginated,
    };
  }, [questions, searchQuery, categoryFilter, curriculumFilter, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, curriculumFilter]);

  // Clamp currentPage when totalPages shrinks (e.g., after deletions)
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

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
      // Invalidate all quiz/due queries including curriculum-specific ones
      queryClient.invalidateQueries({ queryKey: ["/api/quiz/due"], exact: false });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete all questions mutation
  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", "/api/questions");
    },
    onSuccess: (response: { success: boolean; count: number }) => {
      toast({
        title: "Success",
        description: `${response.count} ${response.count === 1 ? 'question' : 'questions'} deleted successfully`,
      });
      setShowDeleteAllDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      // Invalidate all quiz/due queries including curriculum-specific ones
      queryClient.invalidateQueries({ queryKey: ["/api/quiz/due"], exact: false });
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
      const isMap = editingQuestion.questionType === 'map';
      const isMulti = editingQuestion.questionType === 'multi';
      
      setFormData({
        question: editingQuestion.question,
        option1: editingQuestion.options?.[0] || "",
        option2: editingQuestion.options?.[1] || "",
        option3: editingQuestion.options?.[2] || "",
        option4: editingQuestion.options?.[3] || "",
        option5: editingQuestion.options?.[4] || "",
        option6: editingQuestion.options?.[5] || "",
        correctAnswer: editingQuestion.correctAnswer ?? 0,
        correctAnswers: editingQuestion.correctAnswers || [],
        category: editingQuestion.category || "",
        curriculum: editingQuestion.curriculum || "",
        mapRegionName: editingQuestion.mapRegionName || "",
        mapCountry: editingQuestion.mapCountry || "",
        mapLatitude: editingQuestion.mapLatitude || 0,
        mapLongitude: editingQuestion.mapLongitude || 0,
        mapZoom: editingQuestion.mapZoom || 6,
        mapVariant: (editingQuestion.mapVariant as "location-to-name" | "name-to-location") || "location-to-name",
      });
    }
  }, [editingQuestion]);

  const handleSave = () => {
    if (!editingQuestion) return;

    const isMap = editingQuestion.questionType === 'map';
    const isMulti = editingQuestion.questionType === 'multi';

    let updates: any = {
      question: formData.question,
      category: formData.category || undefined,
      curriculum: formData.curriculum || undefined,
    };

    if (isMap) {
      updates = {
        ...updates,
        mapRegionName: formData.mapRegionName,
        mapCountry: formData.mapCountry || undefined,
        mapLatitude: formData.mapLatitude,
        mapLongitude: formData.mapLongitude,
        mapZoom: formData.mapZoom,
        mapVariant: formData.mapVariant,
      };
    } else if (isMulti) {
      updates = {
        ...updates,
        options: [
          formData.option1,
          formData.option2,
          formData.option3,
          formData.option4,
          formData.option5,
          formData.option6,
        ],
        correctAnswers: formData.correctAnswers,
      };
    } else {
      updates = {
        ...updates,
        options: [
          formData.option1,
          formData.option2,
          formData.option3,
          formData.option4,
        ],
        correctAnswer: formData.correctAnswer,
      };
    }

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
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="flex items-center gap-3">
            <Settings className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-serif font-semibold">Question Management</h1>
          </div>
          {questions && questions.length > 0 && (
            <Button
              variant="destructive"
              onClick={() => setShowDeleteAllDialog(true)}
              data-testid="button-delete-all-questions"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete All Questions
            </Button>
          )}
        </div>
        <p className="text-muted-foreground">
          Manage all questions in the system. Edit or delete existing questions.
        </p>
      </div>

      {/* Search and Filter Controls */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search questions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-questions"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="sm:w-[200px]" data-testid="select-category-filter">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={curriculumFilter} onValueChange={setCurriculumFilter}>
              <SelectTrigger className="sm:w-[200px]" data-testid="select-curriculum-filter">
                <SelectValue placeholder="All Curriculums" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Curriculums</SelectItem>
                {curriculums.map((curr) => (
                  <SelectItem key={curr} value={curr}>
                    {curr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            Showing {paginatedQuestions.length} of {filteredQuestions.length} questions
            {filteredQuestions.length !== questions?.length && ` (filtered from ${questions?.length} total)`}
          </div>
        </CardContent>
      </Card>

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

        {filteredQuestions.length === 0 && questions && questions.length > 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No questions match your search or filter criteria.
              </p>
            </CardContent>
          </Card>
        )}

        {paginatedQuestions.map((question) => {
          const isMulti = question.questionType === 'multi';
          const isMap = question.questionType === 'map';
          const correctSet = new Set(isMulti ? (question.correctAnswers || []) : [question.correctAnswer]);
          
          return (
            <Card key={question.id} data-testid={`card-question-${question.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <CardTitle className="text-lg">{question.question}</CardTitle>
                      <Badge variant={isMap ? "outline" : isMulti ? "default" : "secondary"} className="shrink-0">
                        {isMap ? 'Map' : isMulti ? 'Multi-Select' : 'Single Choice'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {question.category && (
                        <span>Category: {question.category}</span>
                      )}
                      {question.curriculum && (
                        <span data-testid={`text-curriculum-${question.id}`}>
                          Curriculum: {question.curriculum}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setEditingQuestion(question)}
                      data-testid={`button-edit-${question.id}`}
                      title="Edit question"
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
                {isMap ? (
                  <div className="space-y-2">
                    <div className="p-3 rounded-lg bg-muted/50 border">
                      <p className="text-sm text-muted-foreground">
                        <strong>Region:</strong> {question.mapRegionName}
                        {question.mapCountry && ` (${question.mapCountry})`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <strong>Coordinates:</strong> {question.mapLatitude?.toFixed(4)}, {question.mapLongitude?.toFixed(4)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <strong>Zoom:</strong> {question.mapZoom} | <strong>Variant:</strong> {question.mapVariant}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {question.options?.map((option, index) => {
                      const isCorrect = correctSet.has(index);
                      return (
                        <div
                          key={index}
                          className={`p-3 rounded-lg border ${
                            isCorrect
                              ? "bg-green-50 dark:bg-green-950/20 border-green-500"
                              : "bg-muted/50"
                          }`}
                        >
                          <span className="font-medium mr-2">
                            {String.fromCharCode(65 + index)}.
                          </span>
                          {option}
                          {isCorrect && (
                            <span className="ml-2 text-sm text-green-600 dark:text-green-400">
                              ✓ Correct
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            data-testid="button-prev-page"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Button
                key={page}
                variant={currentPage === page ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentPage(page)}
                className="min-w-[2.5rem]"
                data-testid={`button-page-${page}`}
              >
                {page}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            data-testid="button-next-page"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingQuestion} onOpenChange={(open) => !open && setEditingQuestion(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Edit {editingQuestion?.questionType === 'map' ? 'Map' : editingQuestion?.questionType === 'multi' ? 'Multi-Select' : 'Single Choice'} Question
            </DialogTitle>
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

            {editingQuestion?.questionType === 'map' ? (
              <>
                <div>
                  <Label htmlFor="mapRegionName">Region Name (Correct Answer)</Label>
                  <Input
                    id="mapRegionName"
                    value={formData.mapRegionName}
                    onChange={(e) => setFormData({ ...formData, mapRegionName: e.target.value })}
                    placeholder="e.g., Mosel"
                    data-testid="input-edit-map-region"
                  />
                </div>

                <div>
                  <Label htmlFor="mapCountry">Country (Optional)</Label>
                  <Input
                    id="mapCountry"
                    value={formData.mapCountry}
                    onChange={(e) => setFormData({ ...formData, mapCountry: e.target.value })}
                    placeholder="e.g., Germany"
                    data-testid="input-edit-map-country"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="mapLatitude">Latitude</Label>
                    <Input
                      id="mapLatitude"
                      type="number"
                      step="0.0001"
                      value={formData.mapLatitude}
                      onChange={(e) => setFormData({ ...formData, mapLatitude: parseFloat(e.target.value) })}
                      data-testid="input-edit-map-latitude"
                    />
                  </div>

                  <div>
                    <Label htmlFor="mapLongitude">Longitude</Label>
                    <Input
                      id="mapLongitude"
                      type="number"
                      step="0.0001"
                      value={formData.mapLongitude}
                      onChange={(e) => setFormData({ ...formData, mapLongitude: parseFloat(e.target.value) })}
                      data-testid="input-edit-map-longitude"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="mapZoom">Zoom Level</Label>
                  <Input
                    id="mapZoom"
                    type="number"
                    step="0.1"
                    min="1"
                    max="20"
                    value={formData.mapZoom}
                    onChange={(e) => setFormData({ ...formData, mapZoom: parseFloat(e.target.value) })}
                    data-testid="input-edit-map-zoom"
                  />
                </div>

                <div>
                  <Label htmlFor="mapVariant">Question Variant</Label>
                  <Select
                    value={formData.mapVariant}
                    onValueChange={(value: "location-to-name" | "name-to-location") => 
                      setFormData({ ...formData, mapVariant: value })
                    }
                  >
                    <SelectTrigger id="mapVariant" data-testid="select-edit-map-variant">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="location-to-name">Location to Name (Show map, type name)</SelectItem>
                      <SelectItem value="name-to-location">Name to Location (Show name, view map)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : editingQuestion?.questionType === 'multi' ? (
              <>
                {['option1', 'option2', 'option3', 'option4', 'option5', 'option6'].map((key, index) => (
                  <div key={key}>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.correctAnswers.includes(index)}
                        onChange={(e) => {
                          const newCorrectAnswers = e.target.checked
                            ? [...formData.correctAnswers, index]
                            : formData.correctAnswers.filter(i => i !== index);
                          setFormData({ ...formData, correctAnswers: newCorrectAnswers.sort() });
                        }}
                        className="w-4 h-4"
                        data-testid={`checkbox-edit-correct-${index}`}
                      />
                      <Label htmlFor={key}>Option {String.fromCharCode(65 + index)} {formData.correctAnswers.includes(index) ? '(Correct)' : ''}</Label>
                    </div>
                    <Input
                      id={key}
                      value={formData[key as keyof typeof formData] as string}
                      onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                      data-testid={`input-edit-${key}`}
                    />
                  </div>
                ))}
              </>
            ) : (
              <>
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
                  <Select
                    value={formData.correctAnswer.toString()}
                    onValueChange={(value) => setFormData({ ...formData, correctAnswer: parseInt(value) })}
                  >
                    <SelectTrigger id="correctAnswer" data-testid="select-edit-correct-answer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">A</SelectItem>
                      <SelectItem value="1">B</SelectItem>
                      <SelectItem value="2">C</SelectItem>
                      <SelectItem value="3">D</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

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

            <div>
              <Label htmlFor="curriculum">Curriculum (Optional)</Label>
              <Input
                id="curriculum"
                value={formData.curriculum}
                onChange={(e) => setFormData({ ...formData, curriculum: e.target.value })}
                placeholder="e.g., WSET2, WSET3"
                data-testid="input-edit-curriculum"
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

      {/* Delete All Questions Confirmation Dialog */}
      <AlertDialog
        open={showDeleteAllDialog}
        onOpenChange={setShowDeleteAllDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Questions?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete ALL {questions?.length || 0} questions and ALL associated review cards for ALL users. This is a destructive operation that cannot be undone. Are you absolutely sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-all">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAllMutation.mutate()}
              className="bg-destructive text-destructive-foreground"
              disabled={deleteAllMutation.isPending}
              data-testid="button-confirm-delete-all"
            >
              {deleteAllMutation.isPending ? "Deleting..." : "Delete All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
