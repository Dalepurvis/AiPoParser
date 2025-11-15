import type { Express } from "express";
import { createServer, type Server } from "http";
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
} from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
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

  // Configure multer for file uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (_req, file, cb) => {
      const allowedMimes = [
        'application/pdf',
        'text/csv',
        'image/png',
        'image/jpeg',
        'image/jpg',
      ];
      if (allowedMimes.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.csv')) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only PDF, CSV, PNG, and JPG files are allowed.'));
      }
    },
  });

  app.post("/api/price-lists/upload", upload.single('file'), async (req, res) => {
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

      // Validate purchase order data
      const validatedPoData = insertPurchaseOrderSchema.parse(poData);

      // Validate items array if present
      if (items !== undefined && !Array.isArray(items)) {
        return res.status(400).json({ error: "Invalid data", details: [{ message: "items must be an array" }] });
      }

      // Validate each item
      if (items && Array.isArray(items)) {
        for (let i = 0; i < items.length; i++) {
          try {
            insertPoItemSchema.omit({ poId: true }).parse(items[i]);
          } catch (itemError) {
            if (itemError instanceof z.ZodError) {
              return res.status(400).json({ 
                error: "Invalid data", 
                details: itemError.errors.map(e => ({ ...e, itemIndex: i }))
              });
            }
            throw itemError;
          }
        }
      }

      // Create purchase order
      const po = await storage.createPurchaseOrder(validatedPoData);

      // Create items
      if (items && Array.isArray(items)) {
        for (const item of items) {
          const validatedItem = insertPoItemSchema.omit({ poId: true }).parse(item);
          await storage.createPoItem({
            ...validatedItem,
            poId: po.id,
          });
        }
      }

      const poWithItems = await storage.getPurchaseOrderWithItems(po.id);
      res.json(poWithItems);
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

  app.post("/api/ai/generate-draft-po", async (req, res) => {
    try {
      const aiRequestSchema = z.object({
        userRequest: z.string().min(1, "userRequest is required and cannot be empty"),
      });
      
      const { userRequest } = aiRequestSchema.parse(req.body);

      const suppliers = await storage.getSuppliers();
      const priceRows = await storage.getPriceListRows();
      const businessRulesArray = await storage.getBusinessRules();

      const businessRules: Record<string, string> = {};
      businessRulesArray.forEach((rule) => {
        businessRules[rule.key] = rule.value;
      });

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

      const businessRules: Record<string, string> = {};
      businessRulesArray.forEach((rule) => {
        businessRules[rule.key] = rule.value;
      });

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
