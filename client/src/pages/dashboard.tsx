import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { FileText, Users, Package, TrendingUp, Plus, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PurchaseOrder } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: purchaseOrders, isLoading: posLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/purchase-orders"],
  });

  const { data: suppliers, isLoading: suppliersLoading } = useQuery({
    queryKey: ["/api/suppliers"],
  });

  const stats = [
    {
      title: "Total POs",
      value: purchaseOrders?.length || 0,
      icon: FileText,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Pending Approval",
      value: purchaseOrders?.filter((po) => po.status === "draft" || po.status === "pending")?.length || 0,
      icon: TrendingUp,
      color: "text-amber-600",
      bgColor: "bg-amber-100 dark:bg-amber-950",
    },
    {
      title: "Active Suppliers",
      value: suppliers?.length || 0,
      icon: Users,
      color: "text-emerald-600",
      bgColor: "bg-emerald-100 dark:bg-emerald-950",
    },
    {
      title: "This Month",
      value: purchaseOrders?.filter((po) => {
        const created = new Date(po.createdAt);
        const now = new Date();
        return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
      })?.length || 0,
      icon: Package,
      color: "text-blue-600",
      bgColor: "bg-blue-100 dark:bg-blue-950",
    },
  ];

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
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-dashboard-title">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-dashboard-description">
            AI-powered purchase order management
          </p>
        </div>
        <Button asChild size="default" data-testid="button-create-new-po">
          <Link href="/create">
            <Plus className="w-4 h-4 mr-2" />
            Create New PO
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} data-testid={`card-stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground" data-testid={`text-stat-title-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
                  {stat.title}
                </CardTitle>
                <div className={`w-10 h-10 rounded-md ${stat.bgColor} flex items-center justify-center`} data-testid={`icon-stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
                  <Icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                {posLoading || suppliersLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-semibold tabular-nums" data-testid={`text-stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
                    {stat.value}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-recent-pos">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg" data-testid="text-recent-pos-title">Recent Purchase Orders</CardTitle>
              <Button variant="ghost" size="sm" asChild data-testid="button-view-all-pos">
                <Link href="/purchase-orders">
                  View All
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {posLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                ))}
              </div>
            ) : purchaseOrders && purchaseOrders.length > 0 ? (
              <div className="space-y-4">
                {purchaseOrders.slice(0, 5).map((po) => (
                  <div
                    key={po.id}
                    className="flex items-center justify-between p-4 rounded-md bg-accent/50 hover-elevate"
                    data-testid={`item-recent-po-${po.id}`}
                  >
                    <div className="flex-1">
                      <div className="font-medium text-sm" data-testid={`text-supplier-name-${po.id}`}>{po.supplierName}</div>
                      <div className="text-xs text-muted-foreground mt-1" data-testid={`text-created-date-${po.id}`}>
                        {new Date(po.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                    </div>
                    <Badge variant={getStatusBadgeVariant(po.status)} data-testid={`badge-po-status-${po.id}`}>
                      {po.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-sm text-muted-foreground mb-4" data-testid="text-no-pos">
                  No purchase orders yet
                </p>
                <Button asChild size="sm" data-testid="button-create-first-po">
                  <Link href="/create">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First PO
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-quick-actions">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg" data-testid="text-quick-actions-title">Quick Actions</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4"
              asChild
              data-testid="button-quick-create-po-card"
            >
              <Link href="/create">
                <Plus className="w-5 h-5 mr-3" />
                <div className="text-left">
                  <div className="font-medium" data-testid="text-quick-action-create-po">Create Purchase Order</div>
                  <div className="text-xs text-muted-foreground" data-testid="text-quick-action-create-po-desc">Use AI to draft from natural language</div>
                </div>
              </Link>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4"
              asChild
              data-testid="button-quick-add-supplier"
            >
              <Link href="/suppliers">
                <Users className="w-5 h-5 mr-3" />
                <div className="text-left">
                  <div className="font-medium" data-testid="text-quick-action-suppliers">Manage Suppliers</div>
                  <div className="text-xs text-muted-foreground" data-testid="text-quick-action-suppliers-desc">Add or edit supplier information</div>
                </div>
              </Link>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4"
              asChild
              data-testid="button-quick-price-lists"
            >
              <Link href="/price-lists">
                <Package className="w-5 h-5 mr-3" />
                <div className="text-left">
                  <div className="font-medium" data-testid="text-quick-action-price-lists">Update Price Lists</div>
                  <div className="text-xs text-muted-foreground" data-testid="text-quick-action-price-lists-desc">Manage SKUs and pricing tiers</div>
                </div>
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
