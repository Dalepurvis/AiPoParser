import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Plus, FileText, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PurchaseOrder } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export default function PurchaseOrders() {
  const { data: purchaseOrders, isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/purchase-orders"],
  });

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "draft":
        return "secondary";
      case "pending":
        return "outline";
      case "approved":
        return "default";
      case "sent":
        return "default";
      default:
        return "secondary";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-purchase-orders-title">
            Purchase Orders
          </h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-purchase-orders-description">
            Manage and track all purchase orders
          </p>
        </div>
        <Button asChild data-testid="button-create-new-po">
          <Link href="/create">
            <Plus className="w-4 h-4 mr-2" />
            Create New PO
          </Link>
        </Button>
      </div>

      <Card data-testid="card-all-pos">
        <CardHeader>
          <CardTitle data-testid="text-all-pos-title">All Purchase Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : purchaseOrders && purchaseOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead data-testid="header-supplier">Supplier</TableHead>
                    <TableHead data-testid="header-status">Status</TableHead>
                    <TableHead data-testid="header-created-date">Created Date</TableHead>
                    <TableHead data-testid="header-notes">Notes</TableHead>
                    <TableHead className="text-right" data-testid="header-actions">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrders.map((po) => (
                    <TableRow key={po.id} data-testid={`row-po-${po.id}`}>
                      <TableCell className="font-medium" data-testid={`cell-supplier-${po.id}`}>
                        {po.supplierName}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={getStatusBadgeVariant(po.status)}
                          data-testid={`badge-status-${po.id}`}
                        >
                          {po.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums" data-testid={`cell-date-${po.id}`}>
                        {new Date(po.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="max-w-xs truncate" data-testid={`cell-notes-${po.id}`}>
                        {po.extraNotesForSupplier || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          data-testid={`button-view-${po.id}`}
                        >
                          <Link href={`/purchase-orders/${po.id}`}>
                            <Eye className="w-4 h-4 mr-2" />
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-sm text-muted-foreground mb-4" data-testid="text-no-pos">
                No purchase orders found
              </p>
              <Button asChild data-testid="button-create-first-po">
                <Link href="/create">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First PO
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
