import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { storage } from "./storage";
import { generateDraftPO, regeneratePOWithClarifications, AIParserError } from "./ai-parser";
import { parseDocument, DocumentParserError } from "./document-parser";
import multer from "multer";
import { z } from "zod";
import {
  insertSupplierSchema,
  insertPriceListRowSchema,
  insertPurchaseOrderSchema,
  insertPoItemSchema,
  insertBusinessRuleSchema,
  clarificationAnswersSchema,
  type DraftPO,
  type AIParserResponse,
  type PurchaseOrderWithItems,
} from "@shared/schema";

const poItemValidationSchema = z.object({
  sku: z.string({ required_error: "SKU is required" }).min(1, "SKU is required"),
  productName: z.string({ required_error: "Product name is required" }).min(1, "Product name is required"),
  unitType: z.string({ required_error: "Unit type is required" }).min(1, "Unit type is required"),
  requestedQuantityRaw: z.string().nullable().optional(),
  quantity: z.coerce.number({ invalid_type_error: "Quantity must be a number" }).int("Quantity must be a whole number").positive("Quantity must be greater than zero"),
  unitPrice: z.coerce.number({ invalid_type_error: "Unit price must be a number" }).nonnegative("Unit price must be zero or greater"),
  currency: z.string({ required_error: "Currency is required" }).min(1, "Currency is required"),
  lineTotal: z.union([
    z.coerce.number({ invalid_type_error: "Line total must be a number" }).nonnegative(),
    z.null(),
  ]).optional(),
  priceSource: z.string().nullable().optional(),
  aiConfidence: z.union([
    z.coerce.number({ invalid_type_error: "Confidence must be a number" }).min(0).max(1),
    z.null(),
  ]).optional(),
  notes: z.string().nullable().optional(),
});

const chatRequestSchema = z.object({
  message: z.string().min(1, "Message cannot be empty"),
  context: z.object({
    currentDraft: z.custom<AIParserResponse>().optional(),
    userRequest: z.string().optional(),
    answers: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  }).optional(),
});

const pdfOutputDir = path.join(process.cwd(), "attached_assets", "po-pdfs");
fs.mkdirSync(pdfOutputDir, { recursive: true });

type ChatAssistantMessage = {
  id: string;
  variant: "text" | "summary" | "questions" | "history";
  content: string;
  meta?: Record<string, unknown>;
};

function buildBusinessRuleMap(rules: Array<{ key: string; value: string }>): Record<string, string> {
  return rules.reduce<Record<string, string>>((acc, rule) => {
    acc[rule.key] = rule.value;
    return acc;
  }, {});
}

function escapePdfText(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function createSimplePdf(lines: string[]): Buffer {
  const sanitizedLines = lines.map((line) => escapePdfText(line));
  let content = "BT\n/F1 12 Tf\n50 760 Td\n";
  sanitizedLines.forEach((line, index) => {
    if (index === 0) {
      content += `(${line}) Tj\n`;
    } else {
      content += `0 -18 Td (${line}) Tj\n`;
    }
  });
  content += "ET";

  const contentLength = Buffer.byteLength(content, "utf8");

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>"); // 1
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"); // 2
  objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"); //3
  objects.push(`<< /Length ${contentLength} >>\nstream\n${content}\nendstream`); //4
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"); //5

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  let currentOffset = pdf.length;
  objects.forEach((body, idx) => {
    const objectString = `${idx + 1} 0 obj\n${body}\nendobj\n`;
    pdf += objectString;
    offsets.push(currentOffset);
    currentOffset += objectString.length;
  });

  const xrefOffset = pdf.length;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    const offset = offsets[i];
    xref += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += xref;
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  pdf += trailer;

  return Buffer.from(pdf, "utf8");
}

async function generatePurchaseOrderPdf(
  po: PurchaseOrderWithItems,
  businessRules: Record<string, string>,
): Promise<{ url: string; fileName: string }> {
  const companyName = businessRules.company_name || "Your Company";
  const companyAddress = businessRules.company_address || "";
  const lines: string[] = [
    `${companyName} – Purchase Order`,
    companyAddress,
    "",
    `PO ID: ${po.id}`,
    `Supplier: ${po.supplierName}`,
    `Status: ${po.status}`,
    "",
    "Items:",
  ];

  po.items.forEach((item, index) => {
    const price = item.unitPrice ? `${item.currency} ${item.unitPrice.toFixed(2)}` : "Price TBD";
    lines.push(
      `${index + 1}. ${item.productName} – ${item.quantity} ${item.unitType} @ ${price}`,
    );
  });

  if (po.extraNotesForSupplier) {
    lines.push("", "Notes: " + po.extraNotesForSupplier);
  }

  if (po.deliveryInstructions) {
    lines.push("Delivery: " + po.deliveryInstructions);
  }

  const fileName = `po-${po.id}.pdf`;
  const filePath = path.join(pdfOutputDir, fileName);
  const pdfBuffer = createSimplePdf(lines);
  await fs.promises.writeFile(filePath, pdfBuffer);
  return { url: `/generated-pdfs/${fileName}`, fileName };
}

function extractAddressFromMessage(message: string): string | null {
  const match = message.match(/address(?: is|:)?\s+(.*)/i);
  return match ? match[1].trim() : null;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.use("/generated-pdfs", express.static(pdfOutputDir));

  app.get("/api/suppliers", async (_req, res) => {
    try {
      const suppliers = await storage.getSuppliers();
      res.json(suppliers);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      res.status(500).json({ error: "Failed to fetch suppliers" });
    }
  });

  app.post("/api/suppliers", async (req, res) => {
    try {
      const data = insertSupplierSchema.parse(req.body);
      const supplier = await storage.createSupplier(data);
      res.json(supplier);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating supplier:", error);
      res.status(500).json({ error: "Failed to create supplier" });
    }
  });

  app.delete("/api/suppliers/:id", async (req, res) => {
    try {
      await storage.deleteSupplier(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting supplier:", error);
      res.status(500).json({ error: "Failed to delete supplier" });
    }
  });

  app.get("/api/price-lists", async (_req, res) => {
    try {
      const priceRows = await storage.getPriceListRows();
      res.json(priceRows);
    } catch (error) {
      console.error("Error fetching price lists:", error);
      res.status(500).json({ error: "Failed to fetch price lists" });
    }
  });

  app.post("/api/price-lists", async (req, res) => {
    try {
      const data = insertPriceListRowSchema.parse(req.body);
      const priceRow = await storage.createPriceListRow(data);
      res.json(priceRow);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating price list row:", error);
      res.status(500).json({ error: "Failed to create price list row" });
    }
  });

  app.delete("/api/price-lists/:id", async (req, res) => {
    try {
      await storage.deletePriceListRow(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting price list row:", error);
      res.status(500).json({ error: "Failed to delete price list row" });
    }
  });

  app.put("/api/price-lists/:id", async (req, res) => {
    try {
      const data = insertPriceListRowSchema.parse(req.body);
      const priceRow = await storage.updatePriceListRow(req.params.id, data);
      res.json(priceRow);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error updating price list row:", error);
      res.status(500).json({ error: "Failed to update price list row" });
    }
  });

  // Configure multer for file uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (_req, file, cb) => {
      const allowedMimes = [
        "application/pdf",
        "text/csv",
        "image/png",
        "image/jpeg",
        "image/jpg",
      ];
      if (allowedMimes.includes(file.mimetype) || file.originalname.toLowerCase().endsWith(".csv")) {
        cb(null, true);
      } else {
        cb(new Error("Invalid file type. Only PDF, CSV, PNG, and JPG files are allowed."));
      }
    },
  });

  app.post("/api/price-lists/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const supplierId = req.body.supplierId;
      if (!supplierId) {
        return res.status(400).json({ error: "Supplier ID is required" });
      }

      // Verify supplier exists
      const supplier = await storage.getSupplier(supplierId);
      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }

      // Parse the document
      const result = await parseDocument(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      res.json({
        ...result,
        supplierId
      });
    } catch (error) {
      if (error instanceof DocumentParserError) {
        return res.status(error.statusCode).json({ 
          error: error.message,
          details: error.details
        });
      }
      if (error instanceof Error && error.message.includes('Invalid file type')) {
        return res.status(400).json({ error: error.message });
      }
      console.error("Error uploading price list:", error);
      res.status(500).json({ error: "Failed to process uploaded file" });
    }
  });

  app.post("/api/price-lists/confirm", async (req, res) => {
    try {
      const confirmSchema = z.object({
        supplierId: z.string().min(1, "Supplier ID is required"),
        items: z.array(insertPriceListRowSchema.omit({ supplierId: true })).min(1, "At least one item is required"),
      });

      const { supplierId, items } = confirmSchema.parse(req.body);

      // Verify supplier exists
      const supplier = await storage.getSupplier(supplierId);
      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }

      // Create all price list rows
      const createdRows = [];
      for (const item of items) {
        const row = await storage.createPriceListRow({
          ...item,
          supplierId,
        });
        createdRows.push(row);
      }

      res.json({
        success: true,
        count: createdRows.length,
        items: createdRows,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error confirming price list items:", error);
      res.status(500).json({ error: "Failed to save price list items" });
    }
  });

  app.get("/api/purchase-orders", async (_req, res) => {
    try {
      const purchaseOrders = await storage.getPurchaseOrders();
      res.json(purchaseOrders);
    } catch (error) {
      console.error("Error fetching purchase orders:", error);
      res.status(500).json({ error: "Failed to fetch purchase orders" });
    }
  });

  app.get("/api/purchase-orders/:id", async (req, res) => {
    try {
      const po = await storage.getPurchaseOrderWithItems(req.params.id);
      if (!po) {
        return res.status(404).json({ error: "Purchase order not found" });
      }
      res.json(po);
    } catch (error) {
      console.error("Error fetching purchase order:", error);
      res.status(500).json({ error: "Failed to fetch purchase order" });
    }
  });

  app.post("/api/purchase-orders", async (req, res) => {
    try {
      const { items, ...poData } = req.body;

      const normalizedPoData = {
        supplierName: poData.supplier_name ?? poData.supplierName,
        status: poData.status ?? "draft",
        extraNotesForSupplier: poData.extra_notes_for_supplier ?? poData.extraNotesForSupplier ?? null,
        deliveryInstructions: poData.delivery_instructions ?? poData.deliveryInstructions ?? null,
        userRequest: poData.userRequest ?? undefined,
      };

      const validatedPoData = insertPurchaseOrderSchema.parse(normalizedPoData);

      if (items !== undefined && !Array.isArray(items)) {
        return res.status(400).json({ error: "Invalid data", details: [{ message: "items must be an array" }] });
      }

      const normalizedItems = Array.isArray(items)
        ? items.map((item) => ({
            sku: item?.sku ?? "",
            productName: item?.product_name ?? item?.productName ?? "",
            unitType: item?.unit_type ?? item?.unitType ?? "",
            requestedQuantityRaw: item?.requested_quantity_raw ?? item?.requestedQuantityRaw ?? null,
            quantity: item?.quantity,
            unitPrice: item?.unit_price ?? item?.unitPrice,
            currency: item?.currency ?? "",
            lineTotal: item?.line_total ?? item?.lineTotal ?? null,
            priceSource: item?.price_source ?? item?.priceSource ?? null,
            aiConfidence: item?.ai_confidence ?? item?.aiConfidence ?? null,
            notes: item?.notes ?? null,
          }))
        : [];

      const validatedItems = [] as Array<z.infer<typeof poItemValidationSchema>>;
      for (let i = 0; i < normalizedItems.length; i++) {
        try {
          validatedItems.push(poItemValidationSchema.parse(normalizedItems[i]));
        } catch (itemError) {
          if (itemError instanceof z.ZodError) {
            return res.status(400).json({
              error: "Invalid data",
              details: itemError.errors.map((e) => ({ ...e, itemIndex: i })),
            });
          }
          throw itemError;
        }
      }

      const po = await storage.createPurchaseOrder(validatedPoData);

      for (const item of validatedItems) {
        await storage.createPoItem({
          ...item,
          poId: po.id,
        });
      }

      const poWithItems = await storage.getPurchaseOrderWithItems(po.id);
      if (!poWithItems) {
        return res.status(500).json({ error: "Failed to load purchase order after save" });
      }

      const businessRulesMap = buildBusinessRuleMap(await storage.getBusinessRules());
      const pdf = await generatePurchaseOrderPdf(poWithItems, businessRulesMap);

      res.json({ ...poWithItems, pdf });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating purchase order:", error);
      res.status(500).json({ error: "Failed to create purchase order" });
    }
  });

  app.delete("/api/purchase-orders/:id", async (req, res) => {
    try {
      await storage.deletePurchaseOrder(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting purchase order:", error);
      res.status(500).json({ error: "Failed to delete purchase order" });
    }
  });

  app.get("/api/business-rules", async (_req, res) => {
    try {
      const rules = await storage.getBusinessRules();
      res.json(rules);
    } catch (error) {
      console.error("Error fetching business rules:", error);
      res.status(500).json({ error: "Failed to fetch business rules" });
    }
  });

  app.post("/api/business-rules/batch", async (req, res) => {
    try {
      // Validate that body is an object with string keys and values
      const batchUpdateSchema = z.record(z.string(), z.string().min(1, "Value cannot be empty"));
      const updates = batchUpdateSchema.parse(req.body);
      
      // Validate each business rule update individually
      const validationErrors = [];
      for (const [key, value] of Object.entries(updates)) {
        try {
          // Validate using insertBusinessRuleSchema
          insertBusinessRuleSchema.parse({ key, value });
        } catch (validationError) {
          if (validationError instanceof z.ZodError) {
            validationErrors.push({
              key,
              errors: validationError.errors
            });
          }
        }
      }

      // If there are validation errors, return them
      if (validationErrors.length > 0) {
        return res.status(400).json({ 
          error: "Invalid data", 
          details: validationErrors 
        });
      }

      // All validations passed, update business rules
      const results = [];
      for (const [key, value] of Object.entries(updates)) {
        const rule = await storage.updateBusinessRule(key, value);
        results.push(rule);
      }

      res.json(results);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error updating business rules:", error);
      res.status(500).json({ error: "Failed to update business rules" });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { message, context } = chatRequestSchema.parse(req.body);
      const normalized = message.toLowerCase();
      const assistantMessages: ChatAssistantMessage[] = [];

      if (normalized.includes("last") && normalized.includes("purchase order")) {
        const recentOrders = (await storage.getPurchaseOrders()).slice(0, 3);
        assistantMessages.push({
          id: randomUUID(),
          variant: "history",
          content: `Here ${recentOrders.length === 1 ? "is" : "are"} your last ${recentOrders.length} purchase order${recentOrders.length === 1 ? "" : "s"}.`,
          meta: { purchaseOrders: recentOrders },
        });
        return res.json({ assistantMessages, updatedDraft: context?.currentDraft ?? null, purchaseOrders: recentOrders });
      }

      if (normalized.includes("address")) {
        const address = extractAddressFromMessage(message) ?? message;
        const rule = await storage.updateBusinessRule("company_address", address);
        assistantMessages.push({
          id: randomUUID(),
          variant: "text",
          content: `Updated your company address to: ${rule.value}. I'll use this on all future paperwork.`,
        });
        return res.json({ assistantMessages, updatedSettings: { company_address: rule.value } });
      }

      const suppliers = await storage.getSuppliers();
      const priceRows = await storage.getPriceListRows();
      const businessRulesArray = await storage.getBusinessRules();
      const businessRules = buildBusinessRuleMap(businessRulesArray);

      if (context?.answers && context.currentDraft) {
        const payload = clarificationAnswersSchema.parse({
          userRequest: context.userRequest ?? message,
          previousDraft: context.currentDraft,
          answers: context.answers,
        });

        const updatedDraft = await regeneratePOWithClarifications(
          payload.userRequest,
          payload.previousDraft,
          payload.answers,
          businessRules,
          suppliers,
          priceRows,
        );

        assistantMessages.push({
          id: randomUUID(),
          variant: "text",
          content: "Thanks — I've used those answers to tighten up the draft.",
        });

        if (updatedDraft.questions_for_user.length > 0) {
          assistantMessages.push({
            id: randomUUID(),
            variant: "questions",
            content: "I still need a couple more details before we can send this.",
            meta: { questions: updatedDraft.questions_for_user },
          });
        }

        return res.json({ assistantMessages, updatedDraft });
      }

      const result = await generateDraftPO(
        message,
        businessRules,
        suppliers,
        priceRows,
      );

      assistantMessages.push({
        id: randomUUID(),
        variant: "summary",
        content: result.draft_po.supplier_name
          ? `Drafted a PO for ${result.draft_po.supplier_name}.`
          : "Drafted a PO — let's pick the right supplier together.",
        meta: {
          reasoning: result.reasoning_summary,
          needsPriceList: priceRows.length === 0,
        },
      });

      if (priceRows.length === 0) {
        assistantMessages.push({
          id: randomUUID(),
          variant: "text",
          content: "I don't see a price list yet. Tell me the SKU (or description), quantity, and price so I can keep going — I'll save it for next time.",
        });
      }

      if (result.questions_for_user.length > 0) {
        assistantMessages.push({
          id: randomUUID(),
          variant: "questions",
          content: "I need a couple of clarifications to finalise this order.",
          meta: { questions: result.questions_for_user },
        });
      }

      res.json({ assistantMessages, updatedDraft: result });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid chat payload", details: error.errors });
      }
      console.error("Chat route error:", error);
      res.status(500).json({ error: "Failed to process chat request" });
    }
  });

  app.post("/api/ai/generate-draft-po", async (req, res) => {
    try {
      const aiRequestSchema = z.object({
        userRequest: z.string().min(1, "userRequest is required and cannot be empty"),
      });
      
      const { userRequest } = aiRequestSchema.parse(req.body);

      const suppliers = await storage.getSuppliers();
      const priceRows = await storage.getPriceListRows();
      const businessRulesArray = await storage.getBusinessRules();
      const businessRules = buildBusinessRuleMap(businessRulesArray);

      const result = await generateDraftPO(
        userRequest,
        businessRules,
        suppliers,
        priceRows
      );

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Validation error in AI generate draft PO:", error.errors);
        return res.status(400).json({ 
          error: "Invalid request data", 
          details: error.errors 
        });
      }

      if (error instanceof AIParserError) {
        console.error(`AI Parser Error (${error.statusCode}):`, error.message, error.details);
        return res.status(error.statusCode).json({
          error: error.message,
          details: error.details
        });
      }

      console.error("Unexpected error generating draft PO:", error);
      res.status(500).json({ 
        error: "An unexpected error occurred while generating the purchase order draft. Please try again.",
        details: { errorType: "internal_server_error" }
      });
    }
  });

  app.post("/api/ai/clarify-draft-po", async (req, res) => {
    try {
      const { userRequest, previousDraft, answers } = clarificationAnswersSchema.parse(req.body);

      if (!answers || Object.keys(answers).length === 0) {
        return res.status(400).json({ 
          error: "No clarification answers provided",
          details: { errorType: "missing_answers" }
        });
      }

      // Validate that answer keys correspond to actual questions
      const questionIds = previousDraft.questions_for_user.map(q => q.id);
      const answerKeys = Object.keys(answers);
      const invalidKeys = answerKeys.filter(key => !questionIds.includes(key));
      
      if (invalidKeys.length > 0) {
        return res.status(400).json({
          error: "Invalid answer keys provided. All answers must correspond to current questions.",
          details: { invalidKeys, validQuestionIds: questionIds }
        });
      }

      const suppliers = await storage.getSuppliers();
      const priceRows = await storage.getPriceListRows();
      const businessRulesArray = await storage.getBusinessRules();
      const businessRules = buildBusinessRuleMap(businessRulesArray);

      const result = await regeneratePOWithClarifications(
        userRequest,
        previousDraft,
        answers,
        businessRules,
        suppliers,
        priceRows
      );

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Validation error in AI clarify draft PO:", error.errors);
        return res.status(400).json({ 
          error: "Invalid request data", 
          details: error.errors 
        });
      }

      if (error instanceof AIParserError) {
        console.error(`AI Parser Error (${error.statusCode}):`, error.message, error.details);
        return res.status(error.statusCode).json({
          error: error.message,
          details: error.details
        });
      }

      console.error("Unexpected error clarifying draft PO:", error);
      res.status(500).json({ 
        error: "An unexpected error occurred while regenerating the purchase order. Please try again.",
        details: { errorType: "internal_server_error" }
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
