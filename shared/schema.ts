import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const suppliers = pgTable("suppliers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
});

export const priceListRows = pgTable("price_list_rows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  supplierId: varchar("supplier_id").notNull().references(() => suppliers.id),
  sku: text("sku").notNull(),
  productName: text("product_name").notNull(),
  unitType: text("unit_type").notNull(),
  minQty: integer("min_qty"),
  maxQty: integer("max_qty"),
  unitPrice: real("unit_price").notNull(),
  currency: text("currency").notNull().default("GBP"),
  notes: text("notes"),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  supplierName: text("supplier_name").notNull(),
  status: text("status").notNull().default("draft"),
  extraNotesForSupplier: text("extra_notes_for_supplier"),
  deliveryInstructions: text("delivery_instructions"),
  userRequest: text("user_request"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const poItems = pgTable("po_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  poId: varchar("po_id").notNull().references(() => purchaseOrders.id),
  sku: text("sku"),
  productName: text("product_name").notNull(),
  unitType: text("unit_type").notNull(),
  requestedQuantityRaw: text("requested_quantity_raw"),
  quantity: integer("quantity").notNull(),
  unitPrice: real("unit_price"),
  currency: text("currency").notNull().default("GBP"),
  lineTotal: real("line_total"),
  priceSource: text("price_source"),
  aiConfidence: real("ai_confidence"),
  notes: text("notes"),
});

export const businessRules = pgTable("business_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
});

export const insertSupplierSchema = createInsertSchema(suppliers).omit({
  id: true,
});

export const insertPriceListRowSchema = createInsertSchema(priceListRows).omit({
  id: true,
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({
  id: true,
  createdAt: true,
});

export const insertPoItemSchema = createInsertSchema(poItems).omit({
  id: true,
});

export const insertBusinessRuleSchema = createInsertSchema(businessRules).omit({
  id: true,
});

export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;

export type PriceListRow = typeof priceListRows.$inferSelect;
export type InsertPriceListRow = z.infer<typeof insertPriceListRowSchema>;

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;

export type PoItem = typeof poItems.$inferSelect;
export type InsertPoItem = z.infer<typeof insertPoItemSchema>;

export type BusinessRule = typeof businessRules.$inferSelect;
export type InsertBusinessRule = z.infer<typeof insertBusinessRuleSchema>;

export type AIQuestion = {
  id: string;
  question: string;
  reason: string;
  related_item_indexes: number[];
  suggested_options: string[];
};

export type AIProfitabilityHint = {
  message: string;
  estimated_savings: number | null;
  applies_to_item_indexes: number[];
};

export type AIReasoning = {
  overall_decision: string;
  considerations: string[];
  alternatives: string[];
  global_confidence: number;
};

export type DraftPOItem = {
  sku: string | null;
  product_name: string;
  unit_type: string;
  requested_quantity_raw: string;
  quantity: number;
  unit_price: number | null;
  currency: string;
  line_total: number | null;
  price_source: string;
  ai_confidence: number;
  ai_uncertain_fields: string[];
  notes: string;
};

export type DraftPO = {
  supplier_name: string;
  status: string;
  items: DraftPOItem[];
  extra_notes_for_supplier: string;
  delivery_instructions: string;
  business_profitability_hints: AIProfitabilityHint[];
};

export type AIParserResponse = {
  draft_po: DraftPO;
  questions_for_user: AIQuestion[];
  reasoning_summary: AIReasoning;
};

export type PurchaseOrderWithItems = PurchaseOrder & {
  items: PoItem[];
};

export const userRequestFormSchema = z.object({
  userRequest: z.string().min(10, "Please enter at least 10 characters describing your order request").max(5000, "Request is too long"),
});

export const businessRulesFormSchema = z.object({
  default_currency: z.string().min(1, "Currency is required"),
  default_tax_rate: z.coerce.number().positive("Tax rate must be positive"),
  fitting_rate_per_m2: z.coerce.number().positive("Fitting rate must be positive"),
  notes: z.string().optional(),
});
