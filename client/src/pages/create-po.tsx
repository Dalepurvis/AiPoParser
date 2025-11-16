import { useState, useMemo, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Loader2, Sparkles, AlertCircle, CheckCircle2, Edit2, Save, X, HelpCircle, PlusCircle, MessageCircle, Send, FileText, History } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  userRequestFormSchema,
  insertPriceListRowSchema,
  type AIParserResponse,
  type DraftPOItem,
  type PriceListRow,
  type Supplier,
  type InsertPriceListRow,
  type AIQuestion,
  type PurchaseOrder,
  type PurchaseOrderWithItems,
} from "@shared/schema";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { z } from "zod";

const examplePrompts = [
  "Order 50 boxes of HydroLoc Grey Herringbone from EverFloor Supplies",
  "I need a full pallet of oak flooring for the Manchester project",
  "Get 25 boxes of luxury vinyl tiles from our usual supplier",
];

type UserRequestForm = z.infer<typeof userRequestFormSchema>;

type ChatAssistantMessage = {
  id: string;
  variant: "text" | "summary" | "questions" | "history";
  content: string;
  meta?: Record<string, any>;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  variant?: ChatAssistantMessage["variant"];
  content: string;
  meta?: Record<string, any>;
};

type ChatResponse = {
  assistantMessages: ChatAssistantMessage[];
  updatedDraft?: AIParserResponse | null;
  purchaseOrders?: PurchaseOrder[];
  updatedSettings?: Record<string, string>;
};

export default function CreatePO() {
  const [aiResponse, setAiResponse] = useState<AIParserResponse | null>(null);
  const [editingItems, setEditingItems] = useState<Record<number, DraftPOItem>>({});
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string | number | boolean>>({});
  const [isCreateProductOpen, setIsCreateProductOpen] = useState(false);
  const [activeQuestionDetails, setActiveQuestionDetails] = useState<{
    id: string;
    type: ReturnType<typeof detectQuestionType>;
    relatedItemIndexes: number[];
  } | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [
    {
      id: "assistant-intro",
      role: "assistant",
      variant: "text",
      content: "Hi! I'm your purchasing manager. Tell me what you need and I'll take care of the purchase order while we chat.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [hasPriceListNudge, setHasPriceListNudge] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatMessages]);
  const { toast } = useToast();

  const { data: priceListRows } = useQuery<PriceListRow[]>({
    queryKey: ["/api/price-lists"],
  });

  const { data: suppliers } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });
  
  const form = useForm<UserRequestForm>({
    resolver: zodResolver(userRequestFormSchema),
    defaultValues: {
      userRequest: "",
    },
  });

  const newProductForm = useForm<InsertPriceListRow>({
    resolver: zodResolver(insertPriceListRowSchema),
    defaultValues: {
      supplierId: "",
      sku: "",
      productName: "",
      unitType: "unit",
      minQty: 1,
      maxQty: null,
      unitPrice: 0,
      currency: "GBP",
      notes: "",
    },
  });

  const isPriceListEmpty = priceListRows !== undefined && priceListRows.length === 0;

  useEffect(() => {
    if (isPriceListEmpty && !hasPriceListNudge) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `assistant-price-${Date.now()}`,
          role: "assistant",
          variant: "text",
          content: "We don't have any price list data yet. No worries — just tell me the SKU (or describe the product), quantity, and price when I ask.",
        },
      ]);
      setHasPriceListNudge(true);
    }
  }, [isPriceListEmpty, hasPriceListNudge]);

  const supplierForDraft = useMemo(() => {
    if (!aiResponse || !suppliers) return null;
    return suppliers.find((supplier) => supplier.name === aiResponse.draft_po.supplier_name) ?? null;
  }, [aiResponse, suppliers]);

  const chatMutation = useMutation({
    mutationFn: async ({
      message,
      answers,
    }: {
      message: string;
      answers?: Record<string, string | number | boolean>;
    }) => {
      const response = await apiRequest("POST", "/api/chat", {
        message,
        context: {
          currentDraft: aiResponse,
          userRequest: form.getValues("userRequest"),
          answers,
        },
      });
      return await response.json() as ChatResponse;
    },
    onSuccess: (data, variables) => {
      if (data.updatedDraft) {
        setAiResponse(data.updatedDraft);
        setEditingItems({});
        setClarificationAnswers({});
      }

      if (data.assistantMessages?.length) {
        setChatMessages((prev) => [
          ...prev,
          ...data.assistantMessages.map((message) => ({
            id: `${message.id}-${Date.now()}`,
            role: "assistant" as const,
            variant: message.variant,
            content: message.content,
            meta: message.meta ?? {},
          })),
        ]);
      }

      if (variables.answers) {
        toast({
          title: "Draft Updated",
          description: "Thanks for the extra info — I’ve woven it into the draft.",
        });
      }
    },
    onError: () => {
      toast({
        title: "Chat Error",
        description: "I couldn't process that. Please try again.",
        variant: "destructive",
      });
    },
  });

  const savePOMutation = useMutation({
    mutationFn: async (data: { draft: AIParserResponse; userRequest: string }) => {
      const response = await apiRequest("POST", "/api/purchase-orders", {
        ...data.draft.draft_po,
        userRequest: data.userRequest,
      });
      return await response.json() as PurchaseOrderWithItems & { pdf?: { url: string; fileName: string } };
    },
    onSuccess: (po) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({
        title: "Purchase order saved",
        description: `PO ${po.id} is ready to send.`,
      });

      setChatMessages((prev) => [
        ...prev,
        {
          id: `assistant-saved-${po.id}`,
          role: "assistant",
          variant: "summary",
          content: `I've created ${po.id} to ${po.supplierName}. ${po.pdf ? "The PDF is attached below." : ""}`.trim(),
          meta: {
            pdf: po.pdf,
            po,
          },
        },
      ]);

      setAiResponse(null);
      setEditingItems({});
      setClarificationAnswers({});
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create purchase order.",
        variant: "destructive",
      });
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: InsertPriceListRow) => {
      const response = await apiRequest("POST", "/api/price-lists", data);
      return await response.json() as PriceListRow;
    },
    onSuccess: (_row, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({
        title: "Product Saved",
        description: `${variables.productName} has been added to the price list.`,
      });

      if (activeQuestionDetails) {
        const isPriceQuestion = activeQuestionDetails.type === "price";
        handleClarificationAnswer(activeQuestionDetails.id, isPriceQuestion ? variables.unitPrice : variables.sku);

        const relatedIndexes = activeQuestionDetails.relatedItemIndexes;

        setAiResponse((previous) => {
          if (!previous) return previous;
          const updatedItems = previous.draft_po.items.map((item, idx) => {
            if (!relatedIndexes.includes(idx)) return item;
            const quantity = item.quantity;
            const newLineTotal = quantity && variables.unitPrice
              ? Number((quantity * variables.unitPrice).toFixed(2))
              : item.line_total;
            const filteredUncertain = item.ai_uncertain_fields.filter(
              (field) => !["sku", "unit_price", "price"].includes(field),
            );
            const updatedCurrency = variables.currency ?? item.currency;
            return {
              ...item,
              sku: variables.sku,
              product_name: variables.productName || item.product_name,
              unit_type: variables.unitType,
              unit_price: variables.unitPrice,
              currency: updatedCurrency,
              line_total: newLineTotal,
              price_source: "Manual price list entry",
              ai_confidence: Math.max(item.ai_confidence, 0.95),
              ai_uncertain_fields: filteredUncertain,
            };
          });

          return {
            ...previous,
            draft_po: {
              ...previous.draft_po,
              items: updatedItems,
            },
          };
        });

        setEditingItems((prev) => {
          const next = { ...prev };
          relatedIndexes.forEach((idx) => {
            if (!next[idx]) return;
            const quantity = next[idx].quantity;
            const newLineTotal = quantity && variables.unitPrice
              ? Number((quantity * variables.unitPrice).toFixed(2))
              : next[idx].line_total;
            const filteredUncertain = next[idx].ai_uncertain_fields.filter(
              (field) => !["sku", "unit_price", "price"].includes(field),
            );
            const updatedCurrency = variables.currency ?? next[idx].currency;
            next[idx] = {
              ...next[idx],
              sku: variables.sku,
              product_name: variables.productName || next[idx].product_name,
              unit_type: variables.unitType,
              unit_price: variables.unitPrice,
              currency: updatedCurrency,
              line_total: newLineTotal,
              price_source: "Manual price list entry",
              ai_confidence: Math.max(next[idx].ai_confidence, 0.95),
              ai_uncertain_fields: filteredUncertain,
            };
          });
          return next;
        });

        if (aiResponse) {
          setClarificationAnswers((prev) => {
            const updates = { ...prev };
            aiResponse.questions_for_user.forEach((question) => {
              if (!question.related_item_indexes.some((index) => relatedIndexes.includes(index))) {
                return;
              }
              const type = detectQuestionType(question.question);
              if (type === "price" && updates[question.id] === undefined) {
                updates[question.id] = variables.unitPrice;
              }
              if ((type === "sku" || type === "selection") && updates[question.id] === undefined) {
                updates[question.id] = variables.sku;
              }
            });
            return updates;
          });
        }
      }

      setIsCreateProductOpen(false);
      setActiveQuestionDetails(null);
      newProductForm.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save the product. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSavePO = () => {
    if (!aiResponse) return;
    if (!canSaveDraft) {
      toast({
        title: "Complete Required Fields",
        description: "Each item needs a supplier, SKU, quantity, and unit price before saving.",
        variant: "destructive",
      });
      return;
    }

    const updatedResponse = { ...aiResponse };
    updatedResponse.draft_po.items = updatedResponse.draft_po.items.map((item, index) => {
      const edited = editingItems[index] ?? item;
      if (edited.unit_price !== null) {
        const recalculatedTotal = Number((edited.unit_price * edited.quantity).toFixed(2));
        return { ...edited, line_total: recalculatedTotal };
      }
      return { ...edited };
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

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "draft":
        return "secondary" as const;
      case "pending":
        return "outline" as const;
      case "approved":
      case "sent":
        return "default" as const;
      default:
        return "secondary" as const;
    }
  };

  const handleClarificationAnswer = (
    questionId: string,
    value: string | number | boolean | null,
  ) => {
    setClarificationAnswers((prev) => {
      if (
        value === null ||
        value === "" ||
        (typeof value === "number" && Number.isNaN(value))
      ) {
        const { [questionId]: _removed, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [questionId]: value,
      };
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

  const openCreateProductDialog = (
    question: AIQuestion,
    questionType: ReturnType<typeof detectQuestionType>,
  ) => {
    if (!suppliers || suppliers.length === 0) {
      toast({
        title: "Add a Supplier First",
        description: "You need at least one supplier before creating a price list entry.",
        variant: "destructive",
      });
      return;
    }

    const matchedSupplier = supplierForDraft ?? suppliers[0];
    const firstIndex = question.related_item_indexes[0];
    const baseItem =
      firstIndex !== undefined
        ? editingItems[firstIndex] ?? aiResponse?.draft_po.items[firstIndex]
        : undefined;

    newProductForm.reset({
      supplierId: matchedSupplier?.id ?? "",
      sku: baseItem?.sku ?? "",
      productName: baseItem?.product_name ?? "",
      unitType: baseItem?.unit_type ?? "unit",
      minQty: 1,
      maxQty: null,
      unitPrice: baseItem?.unit_price ?? 0,
      currency: baseItem?.currency ?? "GBP",
      notes: baseItem?.notes ?? "",
    });

    setActiveQuestionDetails({
      id: question.id,
      type: questionType,
      relatedItemIndexes: question.related_item_indexes,
    });
    setIsCreateProductOpen(true);
  };

  const handleCreateProductSubmit = (data: InsertPriceListRow) => {
    createProductMutation.mutate(data);
  };

  const appendUserMessage = (message: string) => {
    setChatMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: message,
      },
    ]);
  };

  const handleSendMessage = (incoming?: string) => {
    const text = (incoming ?? chatInput).trim();
    if (!text) return;

    setChatInput("");
    appendUserMessage(text);

    const normalized = text.toLowerCase();
    const wantsSave = normalized.includes("save") && normalized.includes("purchase");

    if (wantsSave) {
      if (aiResponse) {
        handleSavePO();
      } else {
        toast({
          title: "Nothing to save yet",
          description: "Ask me to draft something first, then say “save purchase order”.",
        });
      }
      return;
    }

    if (!aiResponse || aiResponse.questions_for_user.length === 0) {
      form.setValue("userRequest", text);
    }

    chatMutation.mutate({ message: text });
  };

  const currentItems = useMemo(() => {
    if (!aiResponse) return [] as DraftPOItem[];
    return aiResponse.draft_po.items.map((item, index) => editingItems[index] ?? item);
  }, [aiResponse, editingItems]);

  const canSaveDraft = useMemo(() => {
    if (!aiResponse) return false;
    if (!aiResponse.draft_po.supplier_name) return false;
    if (currentItems.length === 0) return false;
    return currentItems.every((item) =>
      Boolean(item.sku && item.sku.trim().length > 0) &&
      item.quantity > 0 &&
      item.unit_price !== null &&
      item.unit_price > 0
    );
  }, [aiResponse, currentItems]);

  const allQuestionsAnswered = useMemo(() => {
    if (!aiResponse || aiResponse.questions_for_user.length === 0) return true;
    return aiResponse.questions_for_user.every((q) =>
      clarificationAnswers[q.id] !== undefined && clarificationAnswers[q.id] !== ""
    );
  }, [aiResponse, clarificationAnswers]);

  const handleContinueDraft = () => {
    if (!aiResponse) return;
    if (!allQuestionsAnswered) {
      toast({
        title: "Missing Answers",
        description: "Please answer all clarification questions before continuing.",
        variant: "destructive",
      });
      return;
    }

    const acknowledgement = "Here are the answers you asked for.";
    appendUserMessage(acknowledgement);
    chatMutation.mutate({ message: acknowledgement, answers: clarificationAnswers });
  };

  const renderQuestionInput = (question: AIQuestion, index: number) => {
    const questionType = detectQuestionType(question.question);
    const hasOptions = question.suggested_options.length > 0;
    const answerValue = clarificationAnswers[question.id];

    const handleNumericChange = (raw: string) => {
      if (!raw) {
        handleClarificationAnswer(question.id, null);
        return;
      }
      const parsed = Number(raw);
      handleClarificationAnswer(question.id, Number.isNaN(parsed) ? null : parsed);
    };

    const handleTextChange = (raw: string) => {
      if (!raw) {
        handleClarificationAnswer(question.id, null);
        return;
      }
      handleClarificationAnswer(question.id, raw);
    };

    let inputNode: JSX.Element | null = null;

    if (hasOptions) {
      inputNode = (
        <RadioGroup
          value={typeof answerValue === "string" ? (answerValue as string) : ""}
          onValueChange={(value) => handleClarificationAnswer(question.id, value)}
          className="space-y-2"
        >
          {question.suggested_options.map((option) => (
            <Label
              key={option}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-normal shadow-sm transition hover:bg-muted ${answerValue === option ? "border-primary bg-primary/5" : ""}`}
            >
              <RadioGroupItem value={option} />
              {option}
            </Label>
          ))}
        </RadioGroup>
      );
    } else {
      switch (questionType) {
        case "price":
          inputNode = (
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={typeof answerValue === "number" ? answerValue : ""}
              onChange={(event) => handleNumericChange(event.target.value)}
            />
          );
          break;
        case "quantity":
          inputNode = (
            <Input
              type="number"
              inputMode="numeric"
              value={typeof answerValue === "number" ? answerValue : ""}
              onChange={(event) => handleNumericChange(event.target.value)}
            />
          );
          break;
        case "text":
          inputNode = (
            <Textarea
              value={typeof answerValue === "string" ? (answerValue as string) : ""}
              onChange={(event) => handleTextChange(event.target.value)}
              rows={3}
            />
          );
          break;
        case "sku":
        case "selection":
        default:
          inputNode = (
            <Input
              value={typeof answerValue === "string" ? answerValue : ""}
              onChange={(event) => handleTextChange(event.target.value)}
            />
          );
          break;
      }
    }

    const relatedItems = question.related_item_indexes.length > 0
      ? `Related to item${question.related_item_indexes.length > 1 ? "s" : ""} ${question.related_item_indexes
          .map((idx) => idx + 1)
          .join(", ")}`
      : null;

    return (
      <div
        key={`${question.id}-${index}`}
        className="space-y-3 rounded-lg border border-dashed border-muted-foreground/40 p-4"
        data-testid={`clarification-${index}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium leading-6">{question.question}</p>
            {relatedItems && (
              <p className="text-xs text-muted-foreground">{relatedItems}</p>
            )}
          </div>
          <Badge variant="outline" className="text-xs capitalize">
            {questionType}
          </Badge>
        </div>
        {inputNode}

        {(questionType === "sku" || questionType === "price") && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-fit"
            onClick={() => openCreateProductDialog(question, questionType)}
          >
            <PlusCircle className="mr-2 h-4 w-4" /> Create new product
          </Button>
        )}
      </div>
    );
  };

  const renderChatMessage = (message: ChatMessage) => {
    const isUser = message.role === "user";
    const bubbleClasses = `max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
      isUser ? "bg-primary text-primary-foreground" : "bg-muted"
    }`;

    const renderHistory = () => {
      const orders = (message.meta?.purchaseOrders ?? message.meta?.orders) as PurchaseOrder[] | undefined;
      if (!orders || orders.length === 0) return null;
      return (
        <ul className="mt-3 space-y-3 text-left">
          {orders.map((order) => (
            <li key={order.id} className="rounded-md border bg-background p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                <Badge variant={getStatusBadgeVariant(order.status ?? "draft")}>
                  {order.status ?? "draft"}
                </Badge>
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">{order.id}</p>
              <p className="text-sm text-muted-foreground">{order.supplierName}</p>
            </li>
          ))}
        </ul>
      );
    };

    const renderPDFLink = () => {
      const pdf = message.meta?.pdf as { url: string; fileName: string } | undefined;
      if (!pdf) return null;
      return (
        <Button asChild size="sm" variant="secondary" className="mt-3">
          <a href={pdf.url} target="_blank" rel="noreferrer">
            <FileText className="mr-2 h-4 w-4" /> View PDF ({pdf.fileName})
          </a>
        </Button>
      );
    };

    const renderMetaSummary = () => {
      if (message.variant === "history") return renderHistory();
      if (message.variant === "summary") return renderPDFLink();
      if (message.meta?.notes) {
        return <p className="mt-2 text-xs text-muted-foreground">{message.meta.notes}</p>;
      }
      return null;
    };

    return (
      <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
        <div className={bubbleClasses}>
          <p className="whitespace-pre-line">{message.content}</p>
          {renderMetaSummary()}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-create-po-title">Create Purchase Order</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chat with your purchasing manager to draft, revise, and send purchase orders.
          </p>
        </div>

        {isPriceListEmpty && (
          <Alert className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" data-testid="alert-empty-price-list">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-col gap-2 text-sm md:flex-row md:items-center md:justify-between">
              <span>
                No price list entries found. Add products and pricing so the AI can match SKUs automatically.
              </span>
              <Button asChild size="sm" variant="outline" data-testid="button-go-to-price-lists">
                <Link href="/price-lists">Manage Price Lists</Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(320px,5fr)]">
          <Card className="flex min-h-[500px] flex-col" data-testid="card-chat">
            <CardHeader className="flex flex-col gap-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageCircle className="h-5 w-5 text-primary" />
                Chat with your purchasing manager
              </CardTitle>
              <CardDescription>
                Speak naturally — I’ll draft the PO, chase missing info, and keep a log you can share.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <div ref={chatScrollRef} className="flex-1 space-y-4 overflow-y-auto pr-1">
                {chatMessages.map(renderChatMessage)}
                {chatMutation.isPending && (
                  <div className="text-xs text-muted-foreground">Thinking through the next step…</div>
                )}
              </div>
              <div className="space-y-3 border-t pt-4">
                <div className="flex flex-wrap gap-2">
                  {examplePrompts.map((prompt, index) => (
                    <Button
                      key={prompt}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setChatInput(prompt)}
                      data-testid={`button-example-${index}`}
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>
                <div className="space-y-2">
                  <Textarea
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder="e.g. Order 25 boxes of Harbour Oak Grey 12mm for Nottingham"
                    className="min-h-[120px] resize-none"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={() => handleSendMessage()}
                      disabled={chatMutation.isPending || chatInput.trim().length === 0}
                      data-testid="button-send-message"
                    >
                      {chatMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" /> Send
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleSendMessage("Show me my last three purchase orders.")}
                    >
                      <History className="mr-2 h-4 w-4" /> Last 3 POs
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!aiResponse || !canSaveDraft}
                      onClick={() => handleSendMessage("Save this purchase order.")}
                    >
                      <Save className="mr-2 h-4 w-4" /> Save via chat
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card data-testid="card-draft-summary">
              <CardHeader className="flex flex-col gap-1">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Live Purchase Order Summary
                </CardTitle>
                <CardDescription>
                  I keep this updated as we talk. Jump into edit mode for any row.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {aiResponse ? (
                  <>
                    <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
                      <div>
                        <Label className="text-xs uppercase text-muted-foreground">Supplier</Label>
                        <p className="font-medium">{aiResponse.draft_po.supplier_name || "TBD"}</p>
                      </div>
                      <div>
                        <Label className="text-xs uppercase text-muted-foreground">Status</Label>
                        <Badge variant="outline">{aiResponse.draft_po.status}</Badge>
                      </div>
                      <div>
                        <Label className="text-xs uppercase text-muted-foreground">Items</Label>
                        <p className="font-medium">{aiResponse.draft_po.items.length}</p>
                      </div>
                      <div>
                        <Label className="text-xs uppercase text-muted-foreground">Confidence</Label>
                        <p className="font-medium">{Math.round(aiResponse.reasoning_summary.global_confidence * 100)}%</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {aiResponse.draft_po.items.map((item, index) => {
                        const displayItem = editingItems[index] ?? item;
                        const isEditing = Boolean(editingItems[index]);

                        return (
                          <Card key={`${item.sku ?? "item"}-${index}`} className="bg-muted/30" data-testid={`card-item-${index}`}>
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
                                      <Save className="mr-2 h-4 w-4" /> Save
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => cancelEditingItem(index)}
                                      data-testid={`button-cancel-edit-${index}`}
                                    >
                                      <X className="mr-2 h-4 w-4" /> Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="mb-4 flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="mb-2 flex items-center gap-3">
                                        <h4 className="text-base font-semibold" data-testid={`text-item-product-${index}`}>
                                          {displayItem.product_name}
                                        </h4>
                                        {displayItem.ai_uncertain_fields.length > 0 && (
                                          <Badge variant="outline" className="border-amber-600 text-amber-600" data-testid={`badge-uncertain-${index}`}>
                                            <AlertCircle className="mr-1 h-3 w-3" /> Uncertain
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
                                      <Edit2 className="h-4 w-4" />
                                    </Button>
                                  </div>

                                  <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                                    <div>
                                      <p className="text-xs text-muted-foreground" data-testid={`label-quantity-${index}`}>Quantity</p>
                                      <p className="font-medium" data-testid={`text-item-quantity-${index}`}>
                                        {displayItem.quantity} {displayItem.unit_type}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground" data-testid={`label-unit-price-${index}`}>Unit Price</p>
                                      <p className="font-medium" data-testid={`text-item-price-${index}`}>
                                        {displayItem.unit_price
                                          ? `${displayItem.currency} ${displayItem.unit_price.toFixed(2)}`
                                          : "TBD"}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground" data-testid={`label-line-total-${index}`}>Line Total</p>
                                      <p className="font-medium" data-testid={`text-item-total-${index}`}>
                                        {displayItem.line_total
                                          ? `${displayItem.currency} ${displayItem.line_total.toFixed(2)}`
                                          : "TBD"}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground" data-testid={`label-confidence-${index}`}>Confidence</p>
                                      <div className="flex items-center gap-2">
                                        <Progress value={displayItem.ai_confidence * 100} className="h-2 flex-1" data-testid={`progress-confidence-${index}`} />
                                        <span className={`text-sm font-medium ${getConfidenceColor(displayItem.ai_confidence)}`} data-testid={`text-item-confidence-${index}`}>
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
                        <div className="grid gap-4 md:grid-cols-2">
                          {aiResponse.draft_po.extra_notes_for_supplier && (
                            <div>
                              <Label className="text-xs text-muted-foreground" data-testid="label-supplier-notes">Supplier Notes</Label>
                              <p className="text-sm" data-testid="text-supplier-notes">{aiResponse.draft_po.extra_notes_for_supplier}</p>
                            </div>
                          )}
                          {aiResponse.draft_po.delivery_instructions && (
                            <div>
                              <Label className="text-xs text-muted-foreground" data-testid="label-delivery-instructions">Delivery Instructions</Label>
                              <p className="text-sm" data-testid="text-delivery-instructions">{aiResponse.draft_po.delivery_instructions}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-muted-foreground/40 p-6 text-sm text-muted-foreground">
                    Ask me to order something and I’ll start a draft right away.
                  </div>
                )}
              </CardContent>
            </Card>

            {aiResponse && aiResponse.questions_for_user.length > 0 && (
              <Card data-testid="card-clarifications">
                <CardHeader>
                  <CardTitle>Questions I still have</CardTitle>
                  <CardDescription>
                    Fill these in so I can continue refining the draft.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {aiResponse.questions_for_user.map((question, index) => renderQuestionInput(question, index))}
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setClarificationAnswers({})}
                    >
                      Clear answers
                    </Button>
                    <Button
                      onClick={handleContinueDraft}
                      disabled={!allQuestionsAnswered}
                      data-testid="button-continue-draft"
                    >
                      Continue Draft
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {aiResponse && aiResponse.draft_po.business_profitability_hints.length > 0 && (
              <Card data-testid="card-profitability-hints">
                <CardHeader>
                  <CardTitle data-testid="text-profitability-title">Profitability Hints</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {aiResponse.draft_po.business_profitability_hints.map((hint, index) => (
                    <Alert key={index} className="bg-background" data-testid={`alert-profitability-${index}`}>
                      <AlertDescription className="text-sm" data-testid={`text-profitability-message-${index}`}>
                        {hint.message}
                        {hint.estimated_savings && (
                          <span className="ml-2 font-medium text-emerald-600 dark:text-emerald-400" data-testid={`text-savings-${index}`}>
                            (Est. savings: £{hint.estimated_savings.toFixed(2)})
                          </span>
                        )}
                      </AlertDescription>
                    </Alert>
                  ))}
                </CardContent>
              </Card>
            )}

            {aiResponse && (
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
                            <p className="text-sm" data-testid="text-reasoning-decision">{aiResponse.reasoning_summary.overall_decision}</p>
                          </div>
                          {aiResponse.reasoning_summary.considerations.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-2" data-testid="label-considerations">Considerations</p>
                              <ul className="space-y-1">
                                {aiResponse.reasoning_summary.considerations.map((item, index) => (
                                  <li key={index} className="flex gap-2 text-sm">
                                    <span className="text-muted-foreground">•</span>
                                    <span data-testid={`text-consideration-${index}`}>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {aiResponse.reasoning_summary.alternatives.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-2" data-testid="label-alternatives">Alternatives</p>
                              <ul className="space-y-1">
                                {aiResponse.reasoning_summary.alternatives.map((item, index) => (
                                  <li key={index} className="flex gap-2 text-sm">
                                    <span className="text-muted-foreground">•</span>
                                    <span data-testid={`text-alternative-${index}`}>{item}</span>
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
            )}

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setAiResponse(null);
                  setEditingItems({});
                  setClarificationAnswers({});
                }}
                data-testid="button-discard"
              >
                Discard Draft
              </Button>
              <Button
                onClick={handleSavePO}
                disabled={savePOMutation.isPending || !canSaveDraft}
                data-testid="button-save-po"
              >
                {savePOMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : (
                  "Save Purchase Order"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
      <Dialog
        open={isCreateProductOpen}
        onOpenChange={(open) => {
          setIsCreateProductOpen(open);
          if (!open) {
            setActiveQuestionDetails(null);
            newProductForm.reset();
          }
        }}
      >
        <DialogContent className="max-w-xl" data-testid="dialog-create-product">
          <DialogHeader>
            <DialogTitle data-testid="text-create-product-title">Create New Product</DialogTitle>
            <DialogDescription data-testid="text-create-product-description">
              Save the product to your price list so the AI can reuse it in future drafts.
            </DialogDescription>
          </DialogHeader>

          <Form {...newProductForm}>
            <form onSubmit={newProductForm.handleSubmit(handleCreateProductSubmit)} className="space-y-4">
              <FormField
                control={newProductForm.control}
                name="supplierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-product-supplier">
                          <SelectValue placeholder="Select a supplier" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {suppliers?.map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={newProductForm.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU *</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter SKU" {...field} data-testid="input-product-sku" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={newProductForm.control}
                  name="productName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter product name" {...field} data-testid="input-product-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={newProductForm.control}
                  name="unitType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Type *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-product-unit-type">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="unit">Unit</SelectItem>
                          <SelectItem value="box">Box</SelectItem>
                          <SelectItem value="pallet">Pallet</SelectItem>
                          <SelectItem value="m2">m²</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={newProductForm.control}
                  name="minQty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Min Qty</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value, 10) : null)}
                          data-testid="input-product-min-qty"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={newProductForm.control}
                  name="maxQty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Qty</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value, 10) : null)}
                          data-testid="input-product-max-qty"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={newProductForm.control}
                  name="unitPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Price *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          value={field.value ?? 0}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          data-testid="input-product-unit-price"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={newProductForm.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-product-currency">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="GBP">GBP (£)</SelectItem>
                          <SelectItem value="EUR">EUR (€)</SelectItem>
                          <SelectItem value="USD">USD ($)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={newProductForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Optional"
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                          data-testid="input-product-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateProductOpen(false)}
                  data-testid="button-cancel-create-product"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createProductMutation.isPending}
                  data-testid="button-save-product"
                >
                  {createProductMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Product"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
