"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import {
  BASE_CURRENCY,
  isSupportedCurrency,
  pickDisplayCurrency,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "@/lib/currencies";
import { PROFILE_UPDATED_EVENT, type UserProfile } from "@/lib/user-profile";

export const useDisplayCurrencies = () => {
  const [enabledCurrencies, setEnabledCurrencies] = useState<SupportedCurrency[]>(() => [
    ...SUPPORTED_CURRENCIES,
  ]);
  const [selectedCurrency, setSelectedCurrency] = useState<SupportedCurrency>(BASE_CURRENCY);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const currencyTouched = useRef(false);

  useEffect(() => {
    const applyProfile = (profile: UserProfile) => {
      const enabled =
        profile.enabledCurrencies.length > 0 ? profile.enabledCurrencies : [...SUPPORTED_CURRENCIES];
      setEnabledCurrencies(enabled);
      setProfileName(profile.name || null);
      setSelectedCurrency((current) => {
        if (currencyTouched.current && enabled.includes(current)) {
          return current;
        }
        return pickDisplayCurrency(enabled, profile.preferredCurrency);
      });
    };

    const loadProfile = async () => {
      try {
        const profile = await apiClient.get<UserProfile>("/api/user/profile");
        applyProfile(profile);
      } catch (error) {
        console.error("Failed to fetch profile:", error);
      } finally {
        setIsReady(true);
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

  const selectCurrency = (currency: string) => {
    if (!isSupportedCurrency(currency) || !enabledCurrencies.includes(currency)) {
      return;
    }
    currencyTouched.current = true;
    setSelectedCurrency(currency);
  };

  return { enabledCurrencies, selectedCurrency, selectCurrency, profileName, isReady };
};
