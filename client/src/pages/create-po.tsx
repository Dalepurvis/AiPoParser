import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Sparkles, AlertCircle, CheckCircle2, Edit2, Save, X, HelpCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { userRequestFormSchema, type AIParserResponse, type DraftPOItem } from "@shared/schema";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { z } from "zod";

const examplePrompts = [
  "Order 50 boxes of HydroLoc Grey Herringbone from EverFloor Supplies",
  "I need a full pallet of oak flooring for the Manchester project",
  "Get 25 boxes of luxury vinyl tiles from our usual supplier",
];

type UserRequestForm = z.infer<typeof userRequestFormSchema>;

export default function CreatePO() {
  const [aiResponse, setAiResponse] = useState<AIParserResponse | null>(null);
  const [editingItems, setEditingItems] = useState<Record<number, DraftPOItem>>({});
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string | number>>({});
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  const form = useForm<UserRequestForm>({
    resolver: zodResolver(userRequestFormSchema),
    defaultValues: {
      userRequest: "",
    },
  });

  const generateDraftMutation = useMutation({
    mutationFn: async (request: string) => {
      const response = await apiRequest("POST", "/api/ai/generate-draft-po", { userRequest: request });
      return await response.json() as AIParserResponse;
    },
    onSuccess: (data) => {
      setAiResponse(data);
      setClarificationAnswers({});
      toast({
        title: "Draft PO Generated",
        description: "Review the AI-generated draft and make any necessary adjustments.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate draft PO. Please try again.",
        variant: "destructive",
      });
    },
  });

  const clarifyDraftMutation = useMutation({
    mutationFn: async () => {
      if (!aiResponse) throw new Error("No draft to clarify");
      const response = await apiRequest("POST", "/api/ai/clarify-draft-po", {
        userRequest: form.getValues("userRequest"),
        previousDraft: aiResponse,
        answers: clarificationAnswers,
      });
      return await response.json() as AIParserResponse;
    },
    onSuccess: (data) => {
      setAiResponse(data);
      setClarificationAnswers({});
      
      const hasRemainingQuestions = data.questions_for_user.length > 0;
      const questionsResolved = aiResponse ? aiResponse.questions_for_user.length - data.questions_for_user.length : 0;
      
      if (!hasRemainingQuestions) {
        toast({
          title: "All Clarifications Resolved!",
          description: `Successfully resolved ${questionsResolved} question(s). Your draft is ready to save.`,
        });
      } else {
        toast({
          title: "Draft Updated",
          description: `Resolved ${questionsResolved} question(s). Please answer the ${data.questions_for_user.length} remaining question(s).`,
        });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to regenerate draft. Please try again.",
        variant: "destructive",
      });
    },
  });

  const savePOMutation = useMutation({
    mutationFn: async (data: { draft: AIParserResponse; userRequest: string }) => {
      return await apiRequest("POST", "/api/purchase-orders", {
        ...data.draft.draft_po,
        userRequest: data.userRequest,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({
        title: "Success",
        description: "Purchase order created successfully.",
      });
      navigate("/purchase-orders");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create purchase order.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: UserRequestForm) => {
    generateDraftMutation.mutate(data.userRequest);
  };

  const handleSavePO = () => {
    if (!aiResponse) return;
    
    const updatedResponse = { ...aiResponse };
    Object.entries(editingItems).forEach(([index, item]) => {
      updatedResponse.draft_po.items[Number(index)] = item;
    });
    
    savePOMutation.mutate({ draft: updatedResponse, userRequest: form.getValues("userRequest") });
  };

  const startEditingItem = (index: number, item: DraftPOItem) => {
    setEditingItems({ ...editingItems, [index]: { ...item } });
  };

  const cancelEditingItem = (index: number) => {
    const newEditing = { ...editingItems };
    delete newEditing[index];
    setEditingItems(newEditing);
  };

  const saveEditedItem = (index: number) => {
    cancelEditingItem(index);
  };

  const updateEditingItem = (index: number, field: keyof DraftPOItem, value: any) => {
    if (!editingItems[index]) return;
    setEditingItems({
      ...editingItems,
      [index]: {
        ...editingItems[index],
        [field]: value,
      },
    });
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "text-emerald-600 dark:text-emerald-400";
    if (confidence >= 0.5) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const handleClarificationAnswer = (questionId: string, value: string | number) => {
    setClarificationAnswers({
      ...clarificationAnswers,
      [questionId]: value,
    });
  };

  const detectQuestionType = (question: string): "sku" | "price" | "quantity" | "selection" | "text" => {
    const lowerQuestion = question.toLowerCase();
    if (lowerQuestion.includes("sku") || lowerQuestion.includes("product code")) return "sku";
    if (lowerQuestion.includes("price") || lowerQuestion.includes("cost")) return "price";
    if (lowerQuestion.includes("quantity") || lowerQuestion.includes("how many")) return "quantity";
    if (lowerQuestion.includes("which") || lowerQuestion.includes("select") || lowerQuestion.includes("choose")) return "selection";
    return "text";
  };

  const allQuestionsAnswered = useMemo(() => {
    if (!aiResponse || aiResponse.questions_for_user.length === 0) return true;
    return aiResponse.questions_for_user.every(q => 
      clarificationAnswers[q.id] !== undefined && clarificationAnswers[q.id] !== ''
    );
  }, [aiResponse, clarificationAnswers]);

  const handleContinueDraft = () => {
    if (!allQuestionsAnswered) {
      toast({
        title: "Missing Answers",
        description: "Please answer all clarification questions before continuing.",
        variant: "destructive",
      });
      return;
    }
    clarifyDraftMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold" data-testid="text-create-po-title">Create Purchase Order</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Describe what you need in natural language, and AI will draft your purchase order
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" data-testid="text-card-title">
            <Sparkles className="w-5 h-5 text-primary" data-testid="icon-sparkles" />
            AI Purchase Order Generator
          </CardTitle>
          <CardDescription data-testid="text-card-description">
            Enter your order requirements in plain English. The AI will match products, find pricing, and create a draft.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="userRequest"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel data-testid="label-user-request">Order Request</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Example: Order 50 boxes of HydroLoc Grey Herringbone from EverFloor Supplies for the Manchester warehouse..."
                        className="min-h-[120px] resize-none"
                        data-testid="textarea-user-request"
                        disabled={generateDraftMutation.isPending}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage data-testid="error-user-request" />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground" data-testid="text-examples-label">Try these examples:</p>
                <div className="flex flex-wrap gap-2">
                  {examplePrompts.map((prompt, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="cursor-pointer hover-elevate"
                      onClick={() => form.setValue("userRequest", prompt)}
                      data-testid={`badge-example-${i}`}
                    >
                      {prompt}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  type="submit"
                  disabled={generateDraftMutation.isPending}
                  className="flex-1"
                  data-testid="button-generate-draft"
                >
                  {generateDraftMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" data-testid="icon-loading" />
                      Generating Draft...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" data-testid="icon-generate" />
                      Generate Draft PO
                    </>
                  )}
                </Button>
                {aiResponse && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setAiResponse(null);
                      setEditingItems({});
                    }}
                    data-testid="button-clear-draft"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {aiResponse && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle data-testid="text-draft-po-title">Draft Purchase Order</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground" data-testid="text-confidence-label">Overall Confidence:</span>
                  <Badge
                    variant="outline"
                    className={getConfidenceColor(aiResponse.reasoning_summary.global_confidence)}
                    data-testid="badge-global-confidence"
                  >
                    {Math.round(aiResponse.reasoning_summary.global_confidence * 100)}%
                  </Badge>
                </div>
              </div>
              <CardDescription data-testid="text-supplier-info">
                Supplier: <span className="font-medium text-foreground" data-testid="text-supplier-name">{aiResponse.draft_po.supplier_name}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                {aiResponse.draft_po.items.map((item, index) => {
                  const isEditing = index in editingItems;
                  const displayItem = isEditing ? editingItems[index] : item;

                  return (
                    <Card key={index} data-testid={`card-draft-item-${index}`}>
                      <CardContent className="pt-6">
                        {isEditing ? (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor={`sku-${index}`} data-testid={`label-edit-sku-${index}`}>SKU</Label>
                                <Input
                                  id={`sku-${index}`}
                                  value={displayItem.sku || ""}
                                  onChange={(e) => updateEditingItem(index, "sku", e.target.value)}
                                  data-testid={`input-edit-sku-${index}`}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`product-${index}`} data-testid={`label-edit-product-${index}`}>Product Name</Label>
                                <Input
                                  id={`product-${index}`}
                                  value={displayItem.product_name}
                                  onChange={(e) => updateEditingItem(index, "product_name", e.target.value)}
                                  data-testid={`input-edit-product-${index}`}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`quantity-${index}`} data-testid={`label-edit-quantity-${index}`}>Quantity</Label>
                                <Input
                                  id={`quantity-${index}`}
                                  type="number"
                                  value={displayItem.quantity}
                                  onChange={(e) => updateEditingItem(index, "quantity", parseInt(e.target.value) || 0)}
                                  data-testid={`input-edit-quantity-${index}`}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`unit-type-${index}`} data-testid={`label-edit-unit-type-${index}`}>Unit Type</Label>
                                <Input
                                  id={`unit-type-${index}`}
                                  value={displayItem.unit_type}
                                  onChange={(e) => updateEditingItem(index, "unit_type", e.target.value)}
                                  data-testid={`input-edit-unit-type-${index}`}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`price-${index}`} data-testid={`label-edit-price-${index}`}>Unit Price</Label>
                                <Input
                                  id={`price-${index}`}
                                  type="number"
                                  step="0.01"
                                  value={displayItem.unit_price || ""}
                                  onChange={(e) => updateEditingItem(index, "unit_price", parseFloat(e.target.value) || null)}
                                  data-testid={`input-edit-price-${index}`}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`currency-${index}`} data-testid={`label-edit-currency-${index}`}>Currency</Label>
                                <Input
                                  id={`currency-${index}`}
                                  value={displayItem.currency}
                                  onChange={(e) => updateEditingItem(index, "currency", e.target.value)}
                                  data-testid={`input-edit-currency-${index}`}
                                />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => saveEditedItem(index)} data-testid={`button-save-edit-${index}`}>
                                <Save className="w-4 h-4 mr-2" />
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => cancelEditingItem(index)}
                                data-testid={`button-cancel-edit-${index}`}
                              >
                                <X className="w-4 h-4 mr-2" />
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <h4 className="font-semibold text-base" data-testid={`text-item-product-${index}`}>
                                    {displayItem.product_name}
                                  </h4>
                                  {displayItem.ai_uncertain_fields.length > 0 && (
                                    <Badge variant="outline" className="text-amber-600 border-amber-600" data-testid={`badge-uncertain-${index}`}>
                                      <AlertCircle className="w-3 h-3 mr-1" data-testid={`icon-uncertain-${index}`} />
                                      Uncertain
                                    </Badge>
                                  )}
                                </div>
                                {displayItem.sku && (
                                  <p className="text-sm text-muted-foreground" data-testid={`text-item-sku-${index}`}>
                                    SKU: {displayItem.sku}
                                  </p>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => startEditingItem(index, item)}
                                data-testid={`button-edit-item-${index}`}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                              <div>
                                <p className="text-xs text-muted-foreground mb-1" data-testid={`label-quantity-${index}`}>Quantity</p>
                                <p className="font-medium tabular-nums" data-testid={`text-item-quantity-${index}`}>
                                  {displayItem.quantity} {displayItem.unit_type}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1" data-testid={`label-unit-price-${index}`}>Unit Price</p>
                                <p className="font-medium tabular-nums" data-testid={`text-item-price-${index}`}>
                                  {displayItem.unit_price
                                    ? `${displayItem.currency} ${displayItem.unit_price.toFixed(2)}`
                                    : "TBD"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1" data-testid={`label-line-total-${index}`}>Line Total</p>
                                <p className="font-medium tabular-nums" data-testid={`text-item-total-${index}`}>
                                  {displayItem.line_total
                                    ? `${displayItem.currency} ${displayItem.line_total.toFixed(2)}`
                                    : "TBD"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1" data-testid={`label-confidence-${index}`}>Confidence</p>
                                <div className="flex items-center gap-2">
                                  <Progress value={displayItem.ai_confidence * 100} className="h-2 flex-1" data-testid={`progress-confidence-${index}`} />
                                  <span
                                    className={`text-sm font-medium tabular-nums ${getConfidenceColor(displayItem.ai_confidence)}`}
                                    data-testid={`text-item-confidence-${index}`}
                                  >
                                    {Math.round(displayItem.ai_confidence * 100)}%
                                  </span>
                                </div>
                              </div>
                            </div>

                            {displayItem.notes && (
                              <Alert>
                                <AlertDescription className="text-sm" data-testid={`text-item-notes-${index}`}>
                                  {displayItem.notes}
                                </AlertDescription>
                              </Alert>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {(aiResponse.draft_po.extra_notes_for_supplier || aiResponse.draft_po.delivery_instructions) && (
                <div className="space-y-4">
                  <Separator data-testid="separator-notes" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {aiResponse.draft_po.extra_notes_for_supplier && (
                      <div>
                        <Label className="text-xs text-muted-foreground" data-testid="label-supplier-notes">Supplier Notes</Label>
                        <p className="text-sm mt-1" data-testid="text-supplier-notes">
                          {aiResponse.draft_po.extra_notes_for_supplier}
                        </p>
                      </div>
                    )}
                    {aiResponse.draft_po.delivery_instructions && (
                      <div>
                        <Label className="text-xs text-muted-foreground" data-testid="label-delivery-instructions">Delivery Instructions</Label>
                        <p className="text-sm mt-1" data-testid="text-delivery-instructions">
                          {aiResponse.draft_po.delivery_instructions}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {aiResponse.questions_for_user.length > 0 && (
            <Card className="border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20" data-testid="card-ai-questions">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100" data-testid="text-questions-title">
                  <HelpCircle className="w-5 h-5" data-testid="icon-help-circle" />
                  AI Questions & Clarifications
                </CardTitle>
                <CardDescription data-testid="text-questions-description">
                  Please answer these questions to help the AI improve the purchase order draft
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert className="bg-background border-amber-300 dark:border-amber-700" data-testid="alert-reasoning">
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription data-testid="text-reasoning-explanation">
                    <span className="font-medium">Why clarification is needed: </span>
                    {aiResponse.reasoning_summary.overall_decision}
                  </AlertDescription>
                </Alert>

                {aiResponse.questions_for_user.map((question, i) => {
                  const questionType = detectQuestionType(question.question);
                  const hasOptions = question.suggested_options.length > 0;
                  
                  return (
                    <Card key={question.id} className="bg-background" data-testid={`card-question-${i}`}>
                      <CardContent className="pt-6">
                        <div className="space-y-3">
                          <div>
                            <Label className="text-base font-medium" data-testid={`label-question-${i}`}>
                              {question.question} <span className="text-destructive">*</span>
                            </Label>
                            <p className="text-sm text-muted-foreground mt-1" data-testid={`text-question-reason-${i}`}>
                              {question.reason}
                            </p>
                          </div>

                          {hasOptions ? (
                            question.suggested_options.length > 3 ? (
                              <Select
                                value={clarificationAnswers[question.id]?.toString() || ""}
                                onValueChange={(value) => handleClarificationAnswer(question.id, value)}
                              >
                                <SelectTrigger data-testid={`select-question-${i}`}>
                                  <SelectValue placeholder="Select an option..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {question.suggested_options.map((option, j) => (
                                    <SelectItem key={j} value={option} data-testid={`select-option-${i}-${j}`}>
                                      {option}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <RadioGroup
                                value={clarificationAnswers[question.id]?.toString() || ""}
                                onValueChange={(value) => handleClarificationAnswer(question.id, value)}
                                data-testid={`radiogroup-question-${i}`}
                              >
                                {question.suggested_options.map((option, j) => (
                                  <div key={j} className="flex items-center space-x-2">
                                    <RadioGroupItem value={option} id={`${question.id}-${j}`} data-testid={`radio-option-${i}-${j}`} />
                                    <Label
                                      htmlFor={`${question.id}-${j}`}
                                      className="text-sm font-normal cursor-pointer"
                                      data-testid={`label-option-${i}-${j}`}
                                    >
                                      {option}
                                    </Label>
                                  </div>
                                ))}
                              </RadioGroup>
                            )
                          ) : questionType === "price" || questionType === "quantity" ? (
                            <div className="space-y-2">
                              <Input
                                type="number"
                                step={questionType === "price" ? "0.01" : "1"}
                                min="0"
                                placeholder={questionType === "price" ? "Enter price (e.g., 12.99)" : "Enter quantity"}
                                value={clarificationAnswers[question.id] || ""}
                                onChange={(e) => handleClarificationAnswer(question.id, parseFloat(e.target.value) || 0)}
                                data-testid={`input-question-${i}`}
                              />
                              {questionType === "price" && (
                                <p className="text-xs text-muted-foreground" data-testid={`text-price-hint-${i}`}>
                                  Enter the unit price in GBP
                                </p>
                              )}
                            </div>
                          ) : (
                            <Input
                              type="text"
                              placeholder={questionType === "sku" ? "Enter SKU/Product Code" : "Enter your answer"}
                              value={clarificationAnswers[question.id] || ""}
                              onChange={(e) => handleClarificationAnswer(question.id, e.target.value)}
                              data-testid={`input-question-${i}`}
                            />
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={handleContinueDraft}
                    disabled={!allQuestionsAnswered || clarifyDraftMutation.isPending}
                    className="flex-1"
                    data-testid="button-continue-draft"
                  >
                    {clarifyDraftMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Regenerating Draft...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Continue with Clarifications
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {aiResponse.draft_po.business_profitability_hints.length > 0 && (
            <Card className="border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20" data-testid="card-profitability-hints">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-emerald-900 dark:text-emerald-100" data-testid="text-profitability-title">
                  <CheckCircle2 className="w-5 h-5" data-testid="icon-check-circle" />
                  Profitability Suggestions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {aiResponse.draft_po.business_profitability_hints.map((hint, i) => (
                  <Alert key={i} className="bg-background" data-testid={`alert-profitability-${i}`}>
                    <AlertDescription className="text-sm" data-testid={`text-profitability-message-${i}`}>
                      {hint.message}
                      {hint.estimated_savings && (
                        <span className="font-medium text-emerald-600 dark:text-emerald-400 ml-2" data-testid={`text-savings-${i}`}>
                          (Est. savings: £{hint.estimated_savings.toFixed(2)})
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                ))}
              </CardContent>
            </Card>
          )}

          <Card data-testid="card-reasoning-summary">
            <CardHeader>
              <CardTitle data-testid="text-reasoning-title">AI Reasoning Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible data-testid="accordion-reasoning">
                <AccordionItem value="reasoning" data-testid="accordion-item-reasoning">
                  <AccordionTrigger data-testid="button-toggle-reasoning">View AI Decision Process</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1" data-testid="label-decision">Decision</p>
                        <p className="text-sm" data-testid="text-reasoning-decision">
                          {aiResponse.reasoning_summary.overall_decision}
                        </p>
                      </div>
                      {aiResponse.reasoning_summary.considerations.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-2" data-testid="label-considerations">Considerations</p>
                          <ul className="space-y-1">
                            {aiResponse.reasoning_summary.considerations.map((item, i) => (
                              <li key={i} className="text-sm flex gap-2">
                                <span className="text-muted-foreground">•</span>
                                <span data-testid={`text-consideration-${i}`}>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {aiResponse.reasoning_summary.alternatives.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-2" data-testid="label-alternatives">Alternatives</p>
                          <ul className="space-y-1">
                            {aiResponse.reasoning_summary.alternatives.map((item, i) => (
                              <li key={i} className="text-sm flex gap-2">
                                <span className="text-muted-foreground">•</span>
                                <span data-testid={`text-alternative-${i}`}>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setAiResponse(null);
                setEditingItems({});
              }}
              data-testid="button-discard"
            >
              Discard Draft
            </Button>
            <Button
              onClick={handleSavePO}
              disabled={savePOMutation.isPending}
              data-testid="button-save-po"
            >
              {savePOMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Purchase Order"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
