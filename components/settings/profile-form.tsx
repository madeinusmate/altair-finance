"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { isSupportedCurrency, SUPPORTED_CURRENCIES, type SupportedCurrency } from "@/lib/currencies";
import { readAvatarFile } from "@/lib/read-avatar-file";
import { PROFILE_UPDATED_EVENT, type UserProfile } from "@/lib/user-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const currencyValue = (currency: SupportedCurrency | null): string => currency ?? "";

export const ProfileForm = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatar, setAvatar] = useState("");
  const [preferredCurrency, setPreferredCurrency] = useState("");
  const [enabledCurrencies, setEnabledCurrencies] = useState<SupportedCurrency[]>([...SUPPORTED_CURRENCIES]);
  const [saved, setSaved] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await apiClient.get<UserProfile>("/api/user/profile");
        setName(profile.name);
        setEmail(profile.email ?? "");
        setAvatar(profile.avatar ?? "");
        setPreferredCurrency(currencyValue(profile.preferredCurrency));
        setEnabledCurrencies(profile.enabledCurrencies);
        setSaved(profile);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load profile");
      } finally {
        setIsLoading(false);
      }
    };

    const handleProfileUpdated = (event: Event) => {
      const profile = (event as CustomEvent<UserProfile>).detail;
      if (!profile?.enabledCurrencies) {
        return;
      }
      setEnabledCurrencies(profile.enabledCurrencies);
      setPreferredCurrency((current) =>
        current && isSupportedCurrency(current) && profile.enabledCurrencies.includes(current)
          ? current
          : currencyValue(profile.preferredCurrency)
      );
      setSaved((current) =>
        current
          ? {
              ...current,
              enabledCurrencies: profile.enabledCurrencies,
              preferredCurrency: profile.preferredCurrency,
            }
          : current
      );
    };

    void loadProfile();
    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
  }, []);

  const isDirty =
    saved !== null &&
    (name.trim() !== saved.name ||
      email.trim() !== (saved.email ?? "") ||
      (avatar || null) !== saved.avatar ||
      (preferredCurrency || null) !== saved.preferredCurrency);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const profile = await apiClient.put<UserProfile>("/api/user/profile", {
        name,
        email,
        avatar: avatar || null,
        preferredCurrency: preferredCurrency || null,
      });
      setName(profile.name);
      setEmail(profile.email ?? "");
      setAvatar(profile.avatar ?? "");
      setPreferredCurrency(currencyValue(profile.preferredCurrency));
      setEnabledCurrencies(profile.enabledCurrencies);
      setSaved(profile);
      window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: profile }));
      toast.success("Profile saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save profile");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const dataUrl = await readAvatarFile(file);
      setAvatar(dataUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that photo.");
    }
  };

  const initial = name.trim().charAt(0).toUpperCase() || "N";

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-medium ${avatar ? "" : "avatar-mark"}`}
        >
          {avatar ? (
            <img src={avatar} alt="Profile photo" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Profile photo"
            onChange={handleAvatarChange}
            disabled={isSaving}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSaving}
          >
            Change photo
          </Button>
          {avatar ? (
            <Button type="button" variant="ghost" onClick={() => setAvatar("")} disabled={isSaving}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="profile-name">Name</Label>
          <Input
            id="profile-name"
            name="name"
            type="text"
            autoComplete="name"
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isSaving}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-email">Email</Label>
          <Input
            id="profile-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="Optional"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isSaving}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-currency">Home currency</Label>
          <Select
            value={preferredCurrency || undefined}
            onValueChange={setPreferredCurrency}
            disabled={isSaving}
          >
            <SelectTrigger id="profile-currency" className="w-full">
              <SelectValue placeholder="Select a currency" />
            </SelectTrigger>
            <SelectContent>
              {enabledCurrencies.map((currency) => (
                <SelectItem key={currency} value={currency}>
                  {currency}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Home and Budget open in this currency.</p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={!isDirty || isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="animate-spin" />
              Saving…
            </>
          ) : (
            "Save profile"
          )}
        </Button>
      </div>
    </form>
  );
};
