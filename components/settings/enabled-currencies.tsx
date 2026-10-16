"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import {
  CURRENCY_LABELS,
  orderWithDefault,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "@/lib/currencies";
import { PROFILE_UPDATED_EVENT, type UserProfile } from "@/lib/user-profile";
import { Button } from "@/components/ui/button";
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

  const setDefault = async (currency: SupportedCurrency) => {
    if (currency === homeCurrency) {
      return;
    }

    const previousEnabled = enabled;
    const previousHome = homeCurrency;
    setHomeCurrency(currency);
    setEnabled((current) => (current.includes(currency) ? current : [...current, currency]));
    setIsSaving(true);
    try {
      const profile = await apiClient.put<UserProfile>("/api/user/profile", {
        preferredCurrency: currency,
      });
      setEnabled(profile.enabledCurrencies);
      setHomeCurrency(profile.preferredCurrency);
      window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: profile }));
    } catch (error) {
      setEnabled(previousEnabled);
      setHomeCurrency(previousHome);
      toast.error(error instanceof Error ? error.message : "Failed to save the default currency");
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

  const listed = orderWithDefault([...SUPPORTED_CURRENCIES], homeCurrency);

  return (
    <ul className="divide-y divide-border">
      {listed.map((currency) => {
        const checked = enabled.includes(currency);
        const isDefault = currency === homeCurrency;
        const isOnlyEnabled = checked && enabled.length === 1;

        return (
          <li key={currency} className="flex items-center justify-between gap-4 py-3">
            <div className="space-y-1">
              <Label htmlFor={`enabled-currency-${currency}`}>{currency}</Label>
              <p className="text-sm text-muted-foreground">{CURRENCY_LABELS[currency]}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {isDefault ? (
                <span className="inline-flex h-8 w-[9.25rem] items-center justify-end text-sm text-muted-foreground">
                  Default
                </span>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-[9.25rem]"
                  disabled={isSaving}
                  onClick={() => {
                    void setDefault(currency);
                  }}
                >
                  Set as default
                </Button>
              )}
              <Switch
                id={`enabled-currency-${currency}`}
                checked={checked}
                disabled={isSaving || isDefault || isOnlyEnabled}
                onCheckedChange={(next) => {
                  void toggleCurrency(currency, next);
                }}
                aria-label={`${currency}, ${CURRENCY_LABELS[currency]}`}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
};
