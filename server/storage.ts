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
} from "@shared/schema";
import { randomUUID } from "crypto";

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

export class MemStorage implements IStorage {
  private suppliers: Map<string, Supplier>;
  private priceListRows: Map<string, PriceListRow>;
  private purchaseOrders: Map<string, PurchaseOrder>;
  private poItems: Map<string, PoItem>;
  private businessRules: Map<string, BusinessRule>;

  constructor() {
    this.suppliers = new Map();
    this.priceListRows = new Map();
    this.purchaseOrders = new Map();
    this.poItems = new Map();
    this.businessRules = new Map();

    this.initializeSampleData();
  }

  private initializeSampleData() {
    const supplier1 = this.createSupplierSync({
      name: "EverFloor Supplies",
      email: "orders@everfloor.example.com",
      phone: "+44 1234 567890",
      address: "123 Industrial Estate, Manchester, M1 1AA",
    });

    this.createPriceListRowSync({
      supplierId: supplier1.id,
      sku: "HYDRO-301",
      productName: "HydroLoc Grey Herringbone",
      unitType: "box",
      minQty: 1,
      maxQty: 49,
      unitPrice: 18.99,
      currency: "GBP",
      notes: "Standard box price",
    });

    this.createPriceListRowSync({
      supplierId: supplier1.id,
      sku: "HYDRO-301",
      productName: "HydroLoc Grey Herringbone",
      unitType: "pallet",
      minQty: 50,
      maxQty: null,
      unitPrice: 17.50,
      currency: "GBP",
      notes: "Discounted pallet price (50 boxes)",
    });

    this.createBusinessRuleSync({
      key: "default_currency",
      value: "GBP",
      description: "Default currency for purchase orders",
    });

    this.createBusinessRuleSync({
      key: "default_tax_rate",
      value: "20",
      description: "Default VAT rate percentage",
    });

    this.createBusinessRuleSync({
      key: "fitting_rate_per_m2",
      value: "15",
      description: "Standard fitting cost per square meter",
    });
  }

  private createSupplierSync(insertSupplier: InsertSupplier): Supplier {
    const id = randomUUID();
    const supplier: Supplier = { ...insertSupplier, id };
    this.suppliers.set(id, supplier);
    return supplier;
  }

  private createPriceListRowSync(insertRow: InsertPriceListRow): PriceListRow {
    const id = randomUUID();
    const row: PriceListRow = { ...insertRow, id };
    this.priceListRows.set(id, row);
    return row;
  }

  private createBusinessRuleSync(insertRule: InsertBusinessRule): BusinessRule {
    const id = randomUUID();
    const rule: BusinessRule = { ...insertRule, id };
    this.businessRules.set(id, rule);
    return rule;
  }

  async getSuppliers(): Promise<Supplier[]> {
    return Array.from(this.suppliers.values());
  }

  async getSupplier(id: string): Promise<Supplier | undefined> {
    return this.suppliers.get(id);
  }

  async createSupplier(insertSupplier: InsertSupplier): Promise<Supplier> {
    const id = randomUUID();
    const supplier: Supplier = { ...insertSupplier, id };
    this.suppliers.set(id, supplier);
    return supplier;
  }

  async deleteSupplier(id: string): Promise<void> {
    this.suppliers.delete(id);
  }

  async getPriceListRows(): Promise<PriceListRow[]> {
    return Array.from(this.priceListRows.values());
  }

  async getPriceListRow(id: string): Promise<PriceListRow | undefined> {
    return this.priceListRows.get(id);
  }

  async getPriceListRowsBySupplierId(supplierId: string): Promise<PriceListRow[]> {
    return Array.from(this.priceListRows.values()).filter(
      (row) => row.supplierId === supplierId
    );
  }

  async createPriceListRow(insertRow: InsertPriceListRow): Promise<PriceListRow> {
    const id = randomUUID();
    const row: PriceListRow = { ...insertRow, id };
    this.priceListRows.set(id, row);
    return row;
  }

  async deletePriceListRow(id: string): Promise<void> {
    this.priceListRows.delete(id);
  }

  async getPurchaseOrders(): Promise<PurchaseOrder[]> {
    return Array.from(this.purchaseOrders.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
    return this.purchaseOrders.get(id);
  }

  async getPurchaseOrderWithItems(id: string): Promise<PurchaseOrderWithItems | undefined> {
    const po = this.purchaseOrders.get(id);
    if (!po) return undefined;

    const items = await this.getPoItemsByPoId(id);
    return { ...po, items };
  }

  async createPurchaseOrder(insertPo: InsertPurchaseOrder): Promise<PurchaseOrder> {
    const id = randomUUID();
    const po: PurchaseOrder = {
      ...insertPo,
      id,
      createdAt: new Date(),
    };
    this.purchaseOrders.set(id, po);
    return po;
  }

  async deletePurchaseOrder(id: string): Promise<void> {
    this.purchaseOrders.delete(id);
    const items = await this.getPoItemsByPoId(id);
    items.forEach((item) => this.poItems.delete(item.id));
  }

  async getPoItems(): Promise<PoItem[]> {
    return Array.from(this.poItems.values());
  }

  async getPoItem(id: string): Promise<PoItem | undefined> {
    return this.poItems.get(id);
  }

  async getPoItemsByPoId(poId: string): Promise<PoItem[]> {
    return Array.from(this.poItems.values()).filter((item) => item.poId === poId);
  }

  async createPoItem(insertItem: InsertPoItem): Promise<PoItem> {
    const id = randomUUID();
    const item: PoItem = { ...insertItem, id };
    this.poItems.set(id, item);
    return item;
  }

  async deletePoItem(id: string): Promise<void> {
    this.poItems.delete(id);
  }

  async getBusinessRules(): Promise<BusinessRule[]> {
    return Array.from(this.businessRules.values());
  }

  async getBusinessRule(id: string): Promise<BusinessRule | undefined> {
    return this.businessRules.get(id);
  }

  async getBusinessRuleByKey(key: string): Promise<BusinessRule | undefined> {
    return Array.from(this.businessRules.values()).find((rule) => rule.key === key);
  }

  async createBusinessRule(insertRule: InsertBusinessRule): Promise<BusinessRule> {
    const id = randomUUID();
    const rule: BusinessRule = { ...insertRule, id };
    this.businessRules.set(id, rule);
    return rule;
  }

  async updateBusinessRule(key: string, value: string): Promise<BusinessRule> {
    const existing = await this.getBusinessRuleByKey(key);
    if (existing) {
      existing.value = value;
      this.businessRules.set(existing.id, existing);
      return existing;
    }
    return this.createBusinessRule({ key, value, description: null });
  }

  async deleteBusinessRule(id: string): Promise<void> {
    this.businessRules.delete(id);
  }
}

export const storage = new MemStorage();
