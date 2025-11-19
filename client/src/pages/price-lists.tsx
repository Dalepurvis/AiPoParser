import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Package, Trash2, Upload, FileText, X, Check, AlertCircle, Edit2, Loader2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ExtractedItem = Omit<InsertPriceListRow, 'supplierId'> & {
  confidence?: number;
  uncertainFields?: string[];
};

export default function PriceLists() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [uploadedSupplierId, setUploadedSupplierId] = useState<string>("");
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [editingRow, setEditingRow] = useState<PriceListRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const editForm = useForm<InsertPriceListRow>({
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

  const updatePriceRowMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertPriceListRow }) => {
      const response = await apiRequest("PUT", `/api/price-lists/${id}`, data);
      return await response.json() as PriceListRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({
        title: "Success",
        description: "Price list entry updated successfully.",
      });
      setEditingRow(null);
      editForm.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update price list entry.",
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

  const uploadMutation = useMutation({
    mutationFn: async ({ file, supplierId }: { file: File; supplierId: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('supplierId', supplierId);

      const response = await fetch('/api/price-lists/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload file');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setExtractedItems(data.items || []);
      setUploadedSupplierId(data.supplierId || "");
      setIsReviewMode(true);
      toast({
        title: "Success",
        description: `Extracted ${data.items?.length || 0} items from ${data.metadata?.fileName}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
      resetUploadState();
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async ({ supplierId, items }: { supplierId: string; items: ExtractedItem[] }) => {
      const res = await apiRequest("POST", "/api/price-lists/confirm", { supplierId, items });
      return await res.json() as { success: boolean; count: number; items: PriceListRow[] };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({
        title: "Success",
        description: `Successfully saved ${data.count} price list items.`,
      });
      resetUploadState();
      setIsUploadDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save price list items.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertPriceListRow) => {
    createPriceRowMutation.mutate(data);
  };

  const handleEditSubmit = (data: InsertPriceListRow) => {
    if (!editingRow) return;
    updatePriceRowMutation.mutate({ id: editingRow.id, data });
  };

  const resetUploadState = () => {
    setSelectedFile(null);
    setSelectedSupplierId("");
    setUploadedSupplierId("");
    setExtractedItems([]);
    setIsReviewMode(false);
  };

  const handleFileSelect = (file: File) => {
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast({
        title: "File Too Large",
        description: "Please select a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    const allowedTypes = ['application/pdf', 'text/csv', 'image/png', 'image/jpeg', 'image/jpg'];
    const allowedExtensions = ['.pdf', '.csv', '.png', '.jpg', '.jpeg'];
    const fileName = file.name.toLowerCase();
    const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));

    if (!allowedTypes.includes(file.type) && !hasValidExtension) {
      toast({
        title: "Invalid File Type",
        description: "Please select a PDF, CSV, PNG, or JPG file.",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleUpload = () => {
    if (!selectedFile || !selectedSupplierId) {
      toast({
        title: "Missing Information",
        description: "Please select both a supplier and a file to upload.",
        variant: "destructive",
      });
      return;
    }

    uploadMutation.mutate({ file: selectedFile, supplierId: selectedSupplierId });
  };

  const handleConfirmItems = () => {
    if (extractedItems.length === 0) {
      toast({
        title: "No Items",
        description: "There are no items to save.",
        variant: "destructive",
      });
      return;
    }

    if (!uploadedSupplierId) {
      toast({
        title: "Error",
        description: "Supplier information is missing. Please try uploading the file again.",
        variant: "destructive",
      });
      return;
    }

    confirmMutation.mutate({ supplierId: uploadedSupplierId, items: extractedItems });
  };

  const updateExtractedItem = (index: number, field: keyof ExtractedItem, value: any) => {
    setExtractedItems(prev => prev.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const removeExtractedItem = (index: number) => {
    setExtractedItems(prev => prev.filter((_, i) => i !== index));
  };

  const getSupplierName = (supplierId: string) => {
    return suppliers?.find((s) => s.id === supplierId)?.name || "Unknown";
  };

  const openEditDialog = (row: PriceListRow) => {
    setEditingRow(row);
    editForm.reset({
      supplierId: row.supplierId,
      sku: row.sku,
      productName: row.productName,
      unitType: row.unitType,
      minQty: row.minQty ?? null,
      maxQty: row.maxQty ?? null,
      unitPrice: row.unitPrice,
      currency: row.currency,
      notes: row.notes ?? "",
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-price-lists-title">
            Price Lists
          </h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-price-lists-description">
            Manage product SKUs, pricing tiers, and supplier price lists
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isUploadDialogOpen} onOpenChange={(open) => {
            setIsUploadDialogOpen(open);
            if (!open) resetUploadState();
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-upload-price-list">
                <Upload className="w-4 h-4 mr-2" />
                Upload Price List
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-upload-price-list">
              <DialogHeader>
                <DialogTitle data-testid="text-upload-dialog-title">
                  {isReviewMode ? "Review Extracted Items" : "Upload Price List"}
                </DialogTitle>
                <DialogDescription data-testid="text-upload-dialog-description">
                  {isReviewMode 
                    ? "Review and edit the extracted items before saving"
                    : "Upload a supplier price list (PDF, CSV, or image) to automatically extract product information"
                  }
                </DialogDescription>
              </DialogHeader>

              {!isReviewMode ? (
                <div className="space-y-6">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Supplier *</label>
                    <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                      <SelectTrigger data-testid="select-upload-supplier">
                        <SelectValue placeholder="Select a supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers?.map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Price List File *</label>
                    <div
                      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                        isDragOver ? 'border-primary bg-primary/5' : 'border-border'
                      }`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      data-testid="dropzone-upload"
                    >
                      {selectedFile ? (
                        <div className="space-y-3">
                          <FileText className="w-12 h-12 mx-auto text-primary" />
                          <div>
                            <p className="font-medium" data-testid="text-selected-filename">
                              {selectedFile.name}
                            </p>
                            <p className="text-sm text-muted-foreground" data-testid="text-selected-filesize">
                              {formatFileSize(selectedFile.size)}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedFile(null)}
                            data-testid="button-clear-file"
                          >
                            <X className="w-4 h-4 mr-2" />
                            Clear
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">
                              Drag and drop your file here, or{" "}
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="text-primary underline-offset-4 hover:underline"
                                data-testid="button-browse-file"
                              >
                                browse files
                              </button>
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Supported formats: PDF, CSV, PNG, JPG (max 10MB)
                          </p>
                        </div>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".pdf,.csv,.png,.jpg,.jpeg"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileSelect(file);
                        }}
                        data-testid="input-file-upload"
                      />
                    </div>
                  </div>

                  {uploadMutation.isPending && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Processing file...</span>
                        <span className="text-muted-foreground">This may take a moment</span>
                      </div>
                      <Progress value={undefined} className="w-full" data-testid="progress-upload" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" data-testid="badge-item-count">
                        {extractedItems.length} items extracted
                      </Badge>
                      {selectedFile && (
                        <span className="text-sm text-muted-foreground" data-testid="text-review-filename">
                          from {selectedFile.name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-96">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[100px]">SKU</TableHead>
                            <TableHead>Product Name</TableHead>
                            <TableHead className="w-[100px]">Unit Type</TableHead>
                            <TableHead className="w-[100px]">Price</TableHead>
                            <TableHead className="w-[80px]">Currency</TableHead>
                            <TableHead className="w-[80px]">Min Qty</TableHead>
                            <TableHead className="w-[80px]">Confidence</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {extractedItems.map((item, index) => (
                            <TableRow key={index} data-testid={`row-extracted-${index}`}>
                              <TableCell>
                                <Input
                                  value={item.sku}
                                  onChange={(e) => updateExtractedItem(index, 'sku', e.target.value)}
                                  className="h-8"
                                  data-testid={`input-extracted-sku-${index}`}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={item.productName}
                                  onChange={(e) => updateExtractedItem(index, 'productName', e.target.value)}
                                  className="h-8 min-w-[200px]"
                                  data-testid={`input-extracted-product-${index}`}
                                />
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={item.unitType}
                                  onValueChange={(value) => updateExtractedItem(index, 'unitType', value)}
                                >
                                  <SelectTrigger className="h-8" data-testid={`select-extracted-unit-${index}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="box">Box</SelectItem>
                                    <SelectItem value="pallet">Pallet</SelectItem>
                                    <SelectItem value="m2">m²</SelectItem>
                                    <SelectItem value="unit">Unit</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.unitPrice}
                                  onChange={(e) => updateExtractedItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                                  className="h-8"
                                  data-testid={`input-extracted-price-${index}`}
                                />
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={item.currency}
                                  onValueChange={(value) => updateExtractedItem(index, 'currency', value)}
                                >
                                  <SelectTrigger className="h-8" data-testid={`select-extracted-currency-${index}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="GBP">GBP</SelectItem>
                                    <SelectItem value="EUR">EUR</SelectItem>
                                    <SelectItem value="USD">USD</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={item.minQty || 1}
                                  onChange={(e) => updateExtractedItem(index, 'minQty', parseInt(e.target.value) || 1)}
                                  className="h-8"
                                  data-testid={`input-extracted-minqty-${index}`}
                                />
                              </TableCell>
                              <TableCell>
                                {item.confidence !== undefined && (
                                  <Badge
                                    variant={item.confidence >= 0.8 ? "default" : "secondary"}
                                    className="tabular-nums"
                                    data-testid={`badge-confidence-${index}`}
                                  >
                                    {Math.round(item.confidence * 100)}%
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeExtractedItem(index)}
                                  className="h-8 w-8"
                                  data-testid={`button-remove-${index}`}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {extractedItems.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                      <p>No items to review</p>
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className="flex-col sm:flex-row gap-2">
                {!isReviewMode ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        resetUploadState();
                        setIsUploadDialogOpen(false);
                      }}
                      data-testid="button-cancel-upload"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleUpload}
                      disabled={!selectedFile || !selectedSupplierId || uploadMutation.isPending}
                      data-testid="button-process-upload"
                    >
                      {uploadMutation.isPending ? (
                        <>Processing...</>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Upload & Extract
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsReviewMode(false);
                        setExtractedItems([]);
                      }}
                      data-testid="button-back-to-upload"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={handleConfirmItems}
                      disabled={extractedItems.length === 0 || confirmMutation.isPending}
                      data-testid="button-confirm-save"
                    >
                      {confirmMutation.isPending ? (
                        <>Saving...</>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Confirm & Save {extractedItems.length} Items
                        </>
                      )}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-price-row">
                <Plus className="w-4 h-4 mr-2" />
                Add Manual Entry
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl" data-testid="dialog-add-price-row">
              <DialogHeader>
                <DialogTitle data-testid="text-dialog-title">Add Price List Entry</DialogTitle>
                <DialogDescription data-testid="text-dialog-description">
                  Add a new product with pricing information manually
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
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(row)}
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
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  onClick={() => setIsUploadDialogOpen(true)}
                  data-testid="button-upload-first-price-list"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Price List
                </Button>
                <Button
                  onClick={() => setIsDialogOpen(true)}
                  data-testid="button-add-first-price-row"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Manual Entry
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      <Dialog
        open={!!editingRow}
        onOpenChange={(open) => {
          if (!open) {
            setEditingRow(null);
            editForm.reset();
          }
        }}
      >
        <DialogContent className="max-w-xl" data-testid="dialog-edit-price-row">
          <DialogHeader>
            <DialogTitle data-testid="text-edit-price-row-title">Edit Price List Entry</DialogTitle>
            <DialogDescription data-testid="text-edit-price-row-description">
              Update pricing or product details and save to keep your price list accurate.
            </DialogDescription>
          </DialogHeader>

          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="supplierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-supplier">
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
                  control={editForm.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-sku" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="productName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Name *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-product-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={editForm.control}
                  name="unitType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Type *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-unit-type">
                            <SelectValue placeholder="Select" />
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
                  control={editForm.control}
                  name="minQty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Min Qty</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value, 10) : null)}
                          data-testid="input-edit-min-qty"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="maxQty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Qty</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value, 10) : null)}
                          data-testid="input-edit-max-qty"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={editForm.control}
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
                          data-testid="input-edit-unit-price"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-currency">
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
                  control={editForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Input
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                          data-testid="input-edit-notes"
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
                  onClick={() => setEditingRow(null)}
                  data-testid="button-cancel-edit-price-row"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updatePriceRowMutation.isPending}
                  data-testid="button-save-edit-price-row"
                >
                  {updatePriceRowMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
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
