"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import {
  CURRENCY_LABELS,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "@/lib/currencies";
import { PROFILE_UPDATED_EVENT, type UserProfile } from "@/lib/user-profile";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

export const EnabledCurrencies = () => {
  const [enabled, setEnabled] = useState<SupportedCurrency[]>([...SUPPORTED_CURRENCIES]);
  const [homeCurrency, setHomeCurrency] = useState<SupportedCurrency | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const applyProfile = (profile: UserProfile) => {
      setEnabled(profile.enabledCurrencies);
      setHomeCurrency(profile.preferredCurrency);
    };

    const loadProfile = async () => {
      try {
        const profile = await apiClient.get<UserProfile>("/api/user/profile");
        applyProfile(profile);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load currencies");
      } finally {
        setIsLoading(false);
      }
    };

    const handleProfileUpdated = (event: Event) => {
      const profile = (event as CustomEvent<UserProfile>).detail;
      if (profile?.enabledCurrencies) {
        applyProfile(profile);
      }
    };

    void loadProfile();
    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
  }, []);

  const toggleCurrency = async (currency: SupportedCurrency, next: boolean) => {
    if (currency === homeCurrency && !next) {
      toast.error("Your home currency stays enabled.");
      return;
    }

    const updated = next
      ? SUPPORTED_CURRENCIES.filter((item) => item === currency || enabled.includes(item))
      : enabled.filter((item) => item !== currency);

    if (updated.length === 0) {
      toast.error("Keep at least one currency enabled.");
      return;
    }

    const previous = enabled;
    setEnabled(updated);
    setIsSaving(true);
    try {
      const profile = await apiClient.put<UserProfile>("/api/user/profile", {
        enabledCurrencies: updated,
      });
      setEnabled(profile.enabledCurrencies);
      setHomeCurrency(profile.preferredCurrency);
      window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: profile }));
    } catch (error) {
      setEnabled(previous);
      toast.error(error instanceof Error ? error.message : "Failed to save currencies");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {SUPPORTED_CURRENCIES.map((currency) => {
        const checked = enabled.includes(currency);
        const isHome = currency === homeCurrency;
        const isOnlyEnabled = checked && enabled.length === 1;

        return (
          <li key={currency} className="flex items-center justify-between gap-4 py-3">
            <div className="space-y-1">
              <Label htmlFor={`enabled-currency-${currency}`}>{currency}</Label>
              <p className="text-sm text-muted-foreground">
                {CURRENCY_LABELS[currency]}
                {isHome ? " · Home currency" : ""}
              </p>
            </div>
            <Switch
              id={`enabled-currency-${currency}`}
              checked={checked}
              disabled={isSaving || isHome || isOnlyEnabled}
              onCheckedChange={(next) => {
                void toggleCurrency(currency, next);
              }}
              aria-label={`${currency}, ${CURRENCY_LABELS[currency]}`}
            />
          </li>
        );
      })}
    </ul>
  );
};
