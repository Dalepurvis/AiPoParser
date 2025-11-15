import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Package, Edit2, Trash2 } from "lucide-react";
import type { PriceListRow, InsertPriceListRow, Supplier } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPriceListRowSchema } from "@shared/schema";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export default function PriceLists() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: priceRows, isLoading } = useQuery<PriceListRow[]>({
    queryKey: ["/api/price-lists"],
  });

  const { data: suppliers } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const form = useForm<InsertPriceListRow>({
    resolver: zodResolver(insertPriceListRowSchema),
    defaultValues: {
      supplierId: "",
      sku: "",
      productName: "",
      unitType: "box",
      minQty: 1,
      maxQty: null,
      unitPrice: 0,
      currency: "GBP",
      notes: "",
    },
  });

  const createPriceRowMutation = useMutation({
    mutationFn: async (data: InsertPriceListRow) => {
      return await apiRequest("POST", "/api/price-lists", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({
        title: "Success",
        description: "Price list entry created successfully.",
      });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create price list entry.",
        variant: "destructive",
      });
    },
  });

  const deletePriceRowMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/price-lists/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({
        title: "Success",
        description: "Price list entry deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete price list entry.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertPriceListRow) => {
    createPriceRowMutation.mutate(data);
  };

  const getSupplierName = (supplierId: string) => {
    return suppliers?.find((s) => s.id === supplierId)?.name || "Unknown";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-price-lists-title">
            Price Lists
          </h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-price-lists-description">
            Manage product SKUs, pricing tiers, and supplier price lists
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-price-row">
              <Plus className="w-4 h-4 mr-2" />
              Add Price Entry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl" data-testid="dialog-add-price-row">
            <DialogHeader>
              <DialogTitle data-testid="text-dialog-title">Add Price List Entry</DialogTitle>
              <DialogDescription data-testid="text-dialog-description">
                Add a new product with pricing information
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supplier *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-supplier">
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
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="sku"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SKU *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="HYDRO-301"
                            {...field}
                            data-testid="input-sku"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="productName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product Name *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="HydroLoc Grey Herringbone"
                            {...field}
                            data-testid="input-product-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="unitType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit Type *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-unit-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="box">Box</SelectItem>
                            <SelectItem value="pallet">Pallet</SelectItem>
                            <SelectItem value="m2">m²</SelectItem>
                            <SelectItem value="unit">Unit</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="minQty"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Min Quantity</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || null)}
                            data-testid="input-min-qty"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="maxQty"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Quantity</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || null)}
                            data-testid="input-max-qty"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="unitPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit Price *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="18.99"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            data-testid="input-unit-price"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-currency">
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
                </div>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Optional notes about this price tier"
                          {...field}
                          value={field.value || ""}
                          data-testid="input-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={createPriceRowMutation.isPending}
                    data-testid="button-submit-price-row"
                  >
                    {createPriceRowMutation.isPending ? "Creating..." : "Create Entry"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card data-testid="card-all-price-lists">
        <CardHeader>
          <CardTitle data-testid="text-all-price-lists-title">All Price List Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : priceRows && priceRows.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead data-testid="header-supplier">Supplier</TableHead>
                    <TableHead data-testid="header-sku">SKU</TableHead>
                    <TableHead data-testid="header-product">Product</TableHead>
                    <TableHead data-testid="header-unit-type">Unit Type</TableHead>
                    <TableHead data-testid="header-min-qty">Min Qty</TableHead>
                    <TableHead data-testid="header-max-qty">Max Qty</TableHead>
                    <TableHead data-testid="header-unit-price">Unit Price</TableHead>
                    <TableHead data-testid="header-notes">Notes</TableHead>
                    <TableHead className="text-right" data-testid="header-actions">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceRows.map((row) => (
                    <TableRow key={row.id} data-testid={`row-price-${row.id}`}>
                      <TableCell className="font-medium" data-testid={`cell-supplier-${row.id}`}>
                        {getSupplierName(row.supplierId)}
                      </TableCell>
                      <TableCell className="font-mono text-sm" data-testid={`cell-sku-${row.id}`}>
                        {row.sku}
                      </TableCell>
                      <TableCell data-testid={`cell-product-${row.id}`}>
                        {row.productName}
                      </TableCell>
                      <TableCell data-testid={`cell-unit-type-${row.id}`}>
                        {row.unitType}
                      </TableCell>
                      <TableCell className="tabular-nums" data-testid={`cell-min-qty-${row.id}`}>
                        {row.minQty || "-"}
                      </TableCell>
                      <TableCell className="tabular-nums" data-testid={`cell-max-qty-${row.id}`}>
                        {row.maxQty || "-"}
                      </TableCell>
                      <TableCell className="tabular-nums font-medium" data-testid={`cell-price-${row.id}`}>
                        {row.currency} {row.unitPrice.toFixed(2)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate" data-testid={`cell-notes-${row.id}`}>
                        {row.notes || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            data-testid={`button-edit-${row.id}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deletePriceRowMutation.mutate(row.id)}
                            disabled={deletePriceRowMutation.isPending}
                            data-testid={`button-delete-${row.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Package className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-sm text-muted-foreground mb-4" data-testid="text-no-price-lists">
                No price list entries found
              </p>
              <Button
                onClick={() => setIsDialogOpen(true)}
                data-testid="button-add-first-price-row"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Entry
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
