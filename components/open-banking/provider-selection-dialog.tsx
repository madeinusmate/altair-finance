"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, Shield, ArrowRight } from "lucide-react";

interface ProviderSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const providers = [
  {
    id: "finverse" as const,
    name: "Finverse",
    description:
      "Connect to banks across Asia-Pacific with Finverse Open Banking. Supports a wide range of financial institutions in the region.",
    regions: ["Asia-Pacific", "Hong Kong", "Singapore", "Thailand"],
    features: ["Open Banking API", "Real-time data", "Multi-currency"],
  },
  {
    id: "plaid" as const,
    name: "Plaid",
    description:
      "Connect to thousands of banks worldwide with Plaid. Widely used across North America and Europe with broad institutional coverage.",
    regions: ["United States", "Canada", "United Kingdom", "Europe"],
    features: ["11,000+ institutions", "Instant auth", "Multi-currency"],
  },
];

export const ProviderSelectionDialog = ({
  open,
  onOpenChange,
}: ProviderSelectionDialogProps) => {
  const router = useRouter();

  const handleProviderSelect = (providerId: "finverse" | "plaid") => {
    onOpenChange(false);
    router.push(`/accounts/connect?provider=${providerId}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Choose a Banking Provider
          </DialogTitle>
          <DialogDescription>
            Select a provider to securely connect your bank account. Both providers use bank-level encryption to protect your data.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 mt-2">
          {providers.map((provider) => (
            <Card
              key={provider.id}
              className="cursor-pointer transition-all hover:border-primary hover:shadow-sm group"
              onClick={() => handleProviderSelect(provider.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-semibold text-base">
                        {provider.name}
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {provider.description}
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {provider.regions.map((region) => (
                        <Badge
                          key={region}
                          variant="secondary"
                          className="text-xs font-normal"
                        >
                          {region}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground ml-3 mt-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
