import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings as SettingsIcon, Save } from "lucide-react";
import type { BusinessRule } from "@shared/schema";
import { businessRulesFormSchema } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

type BusinessRulesFormValues = z.infer<typeof businessRulesFormSchema>;

export default function Settings() {
  const { toast } = useToast();

  const form = useForm<BusinessRulesFormValues>({
    resolver: zodResolver(businessRulesFormSchema),
    defaultValues: {
      default_currency: "GBP",
      default_tax_rate: 20,
      fitting_rate_per_m2: 15,
      notes: "",
    },
  });

  const { data: businessRules, isLoading } = useQuery<BusinessRule[]>({
    queryKey: ["/api/business-rules"],
  });

  useEffect(() => {
    if (businessRules) {
      const rulesMap: Record<string, string> = {};
      businessRules.forEach((rule) => {
        rulesMap[rule.key] = rule.value;
      });
      form.reset({
        default_currency: rulesMap.default_currency || "GBP",
        default_tax_rate: parseFloat(rulesMap.default_tax_rate || "20"),
        fitting_rate_per_m2: parseFloat(rulesMap.fitting_rate_per_m2 || "15"),
        notes: rulesMap.notes || "",
      });
    }
  }, [businessRules, form]);

  const updateRulesMutation = useMutation({
    mutationFn: async (data: BusinessRulesFormValues) => {
      const payload: Record<string, string> = {
        default_currency: data.default_currency,
        default_tax_rate: data.default_tax_rate.toString(),
        fitting_rate_per_m2: data.fitting_rate_per_m2.toString(),
      };
      if (data.notes && data.notes.trim().length > 0) {
        payload.notes = data.notes;
      }
      return await apiRequest("POST", "/api/business-rules/batch", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-rules"] });
      toast({
        title: "Success",
        description: "Business rules updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update business rules.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: BusinessRulesFormValues) => {
    updateRulesMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold" data-testid="text-settings-title">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1" data-testid="text-settings-description">
          Configure business rules and default values
        </p>
      </div>

      <Card data-testid="card-business-rules">
        <CardHeader>
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-primary" data-testid="icon-settings" />
            <CardTitle data-testid="text-card-title">Business Rules Configuration</CardTitle>
          </div>
          <CardDescription data-testid="text-card-description">
            These settings are used by the AI when generating purchase orders
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="default_currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel data-testid="label-default-currency">Default Currency</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="GBP"
                            data-testid="input-default-currency"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription data-testid="text-currency-help">
                          Default currency for purchase orders (e.g., GBP, EUR, USD)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="default_tax_rate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel data-testid="label-tax-rate">Default Tax Rate (%)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="20"
                            data-testid="input-tax-rate"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription data-testid="text-tax-rate-help">
                          Standard tax rate for calculations (e.g., 20 for 20% VAT)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="fitting_rate_per_m2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel data-testid="label-fitting-rate">Fitting Rate per m² (£)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="15"
                            data-testid="input-fitting-rate"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription data-testid="text-fitting-rate-help">
                          Standard fitting cost per square meter
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator data-testid="separator-settings" />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel data-testid="label-notes">Additional Notes</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Any additional business rules or guidelines..."
                          data-testid="input-notes"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription data-testid="text-notes-help">
                        Custom rules or guidelines for the AI to consider
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={updateRulesMutation.isPending}
                    data-testid="button-save-settings"
                  >
                    {updateRulesMutation.isPending ? (
                      "Saving..."
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
