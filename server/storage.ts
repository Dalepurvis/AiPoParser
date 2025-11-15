import {
  type Supplier,
  type InsertSupplier,
  type PriceListRow,
  type InsertPriceListRow,
  type PurchaseOrder,
  type InsertPurchaseOrder,
  type PoItem,
  type InsertPoItem,
  type BusinessRule,
  type InsertBusinessRule,
  type PurchaseOrderWithItems,
  suppliers,
  priceListRows,
  purchaseOrders,
  poItems,
  businessRules,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getSuppliers(): Promise<Supplier[]>;
  getSupplier(id: string): Promise<Supplier | undefined>;
  createSupplier(supplier: InsertSupplier): Promise<Supplier>;
  deleteSupplier(id: string): Promise<void>;

  getPriceListRows(): Promise<PriceListRow[]>;
  getPriceListRow(id: string): Promise<PriceListRow | undefined>;
  getPriceListRowsBySupplierId(supplierId: string): Promise<PriceListRow[]>;
  createPriceListRow(row: InsertPriceListRow): Promise<PriceListRow>;
  deletePriceListRow(id: string): Promise<void>;

  getPurchaseOrders(): Promise<PurchaseOrder[]>;
  getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined>;
  getPurchaseOrderWithItems(id: string): Promise<PurchaseOrderWithItems | undefined>;
  createPurchaseOrder(po: InsertPurchaseOrder): Promise<PurchaseOrder>;
  deletePurchaseOrder(id: string): Promise<void>;

  getPoItems(): Promise<PoItem[]>;
  getPoItem(id: string): Promise<PoItem | undefined>;
  getPoItemsByPoId(poId: string): Promise<PoItem[]>;
  createPoItem(item: InsertPoItem): Promise<PoItem>;
  deletePoItem(id: string): Promise<void>;

  getBusinessRules(): Promise<BusinessRule[]>;
  getBusinessRule(id: string): Promise<BusinessRule | undefined>;
  getBusinessRuleByKey(key: string): Promise<BusinessRule | undefined>;
  createBusinessRule(rule: InsertBusinessRule): Promise<BusinessRule>;
  updateBusinessRule(key: string, value: string): Promise<BusinessRule>;
  deleteBusinessRule(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getSuppliers(): Promise<Supplier[]> {
    return await db.select().from(suppliers);
  }

  async getSupplier(id: string): Promise<Supplier | undefined> {
    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
    return supplier || undefined;
  }

  async createSupplier(insertSupplier: InsertSupplier): Promise<Supplier> {
    const [supplier] = await db.insert(suppliers).values(insertSupplier).returning();
    return supplier;
  }

  async deleteSupplier(id: string): Promise<void> {
    await db.delete(suppliers).where(eq(suppliers.id, id));
  }

  async getPriceListRows(): Promise<PriceListRow[]> {
    return await db.select().from(priceListRows);
  }

  async getPriceListRow(id: string): Promise<PriceListRow | undefined> {
    const [row] = await db.select().from(priceListRows).where(eq(priceListRows.id, id));
    return row || undefined;
  }

  async getPriceListRowsBySupplierId(supplierId: string): Promise<PriceListRow[]> {
    return await db.select().from(priceListRows).where(eq(priceListRows.supplierId, supplierId));
  }

  async createPriceListRow(insertRow: InsertPriceListRow): Promise<PriceListRow> {
    const [row] = await db.insert(priceListRows).values(insertRow).returning();
    return row;
  }

  async deletePriceListRow(id: string): Promise<void> {
    await db.delete(priceListRows).where(eq(priceListRows.id, id));
  }

  async getPurchaseOrders(): Promise<PurchaseOrder[]> {
    return await db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.createdAt));
  }

  async getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
    return po || undefined;
  }

  async getPurchaseOrderWithItems(id: string): Promise<PurchaseOrderWithItems | undefined> {
    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
    if (!po) return undefined;

    const items = await this.getPoItemsByPoId(id);
    return { ...po, items };
  }

  async createPurchaseOrder(insertPo: InsertPurchaseOrder): Promise<PurchaseOrder> {
    const [po] = await db.insert(purchaseOrders).values(insertPo).returning();
    return po;
  }

  async deletePurchaseOrder(id: string): Promise<void> {
    await db.delete(poItems).where(eq(poItems.poId, id));
    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  }

  async getPoItems(): Promise<PoItem[]> {
    return await db.select().from(poItems);
  }

  async getPoItem(id: string): Promise<PoItem | undefined> {
    const [item] = await db.select().from(poItems).where(eq(poItems.id, id));
    return item || undefined;
  }

  async getPoItemsByPoId(poId: string): Promise<PoItem[]> {
    return await db.select().from(poItems).where(eq(poItems.poId, poId));
  }

  async createPoItem(insertItem: InsertPoItem): Promise<PoItem> {
    const [item] = await db.insert(poItems).values(insertItem).returning();
    return item;
  }

  async deletePoItem(id: string): Promise<void> {
    await db.delete(poItems).where(eq(poItems.id, id));
  }

  async getBusinessRules(): Promise<BusinessRule[]> {
    return await db.select().from(businessRules);
  }

  async getBusinessRule(id: string): Promise<BusinessRule | undefined> {
    const [rule] = await db.select().from(businessRules).where(eq(businessRules.id, id));
    return rule || undefined;
  }

  async getBusinessRuleByKey(key: string): Promise<BusinessRule | undefined> {
    const [rule] = await db.select().from(businessRules).where(eq(businessRules.key, key));
    return rule || undefined;
  }

  async createBusinessRule(insertRule: InsertBusinessRule): Promise<BusinessRule> {
    const [rule] = await db.insert(businessRules).values(insertRule).returning();
    return rule;
  }

  async updateBusinessRule(key: string, value: string): Promise<BusinessRule> {
    const existing = await this.getBusinessRuleByKey(key);
    if (existing) {
      const [updated] = await db
        .update(businessRules)
        .set({ value })
        .where(eq(businessRules.key, key))
        .returning();
      return updated;
    }
    return this.createBusinessRule({ key, value, description: null });
  }

  async deleteBusinessRule(id: string): Promise<void> {
    await db.delete(businessRules).where(eq(businessRules.id, id));
  }
}

export const storage = new DatabaseStorage();
