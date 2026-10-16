import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withDb } from "@/lib/api-utils";
import { userSettings } from "@/lib/db/schema";
import {
  isSupportedCurrency,
  parseEnabledCurrencies,
  readEnabledCurrencies,
  serializeEnabledCurrencies,
  SUPPORTED_CURRENCIES,
  orderWithDefault,
  withHomeCurrency,
} from "@/lib/currencies";
import { parseProfileInput, isAvatarDataUrl, type UserProfile } from "@/lib/user-profile";

export const dynamic = "force-dynamic";

const toProfile = (row: {
  username: string;
  email: string | null;
  avatar: string | null;
  preferredCurrency: string | null;
  enabledCurrencies: string | null;
}): UserProfile => {
  const preferredCurrency =
    row.preferredCurrency && isSupportedCurrency(row.preferredCurrency) ? row.preferredCurrency : null;

  return {
    name: row.username,
    email: row.email,
    avatar: row.avatar && isAvatarDataUrl(row.avatar) ? row.avatar : null,
    preferredCurrency,
    enabledCurrencies: orderWithDefault(
      withHomeCurrency(readEnabledCurrencies(row.enabledCurrencies), preferredCurrency),
      preferredCurrency
    ),
  };
};

const emptyProfile = (): UserProfile => ({
  name: "",
  email: null,
  avatar: null,
  preferredCurrency: null,
  enabledCurrencies: [...SUPPORTED_CURRENCIES],
});

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  return withDb(request, async (db) => {
    const row = db.select().from(userSettings).where(eq(userSettings.id, "user")).get();

    if (!row) {
      return emptyProfile();
    }

    return toProfile(row);
  });
};

export const PUT = async (request: NextRequest): Promise<NextResponse> => {
  return withDb(request, async (db) => {
    const body = await request.json();
    const existing = db.select().from(userSettings).where(eq(userSettings.id, "user")).get();
    const updatesCurrencySettings =
      body?.name === undefined &&
      (body?.enabledCurrencies !== undefined || body?.preferredCurrency !== undefined);

    if (updatesCurrencySettings) {
      if (!existing) {
        return NextResponse.json({ error: "Save your profile before choosing currencies." }, { status: 400 });
      }

      let preferredCurrency =
        existing.preferredCurrency && isSupportedCurrency(existing.preferredCurrency)
          ? existing.preferredCurrency
          : null;
      if (body?.preferredCurrency !== undefined) {
        const code =
          typeof body.preferredCurrency === "string" ? body.preferredCurrency.trim().toUpperCase() : "";
        if (!isSupportedCurrency(code)) {
          return NextResponse.json({ error: "Choose a supported currency." }, { status: 400 });
        }
        preferredCurrency = code;
      }

      let enabled = readEnabledCurrencies(existing.enabledCurrencies);
      if (body?.enabledCurrencies !== undefined) {
        const parsedEnabled = parseEnabledCurrencies(body.enabledCurrencies);
        if (!parsedEnabled.ok) {
          return NextResponse.json({ error: parsedEnabled.error }, { status: 400 });
        }
        enabled = parsedEnabled.currencies;
      }

      if (preferredCurrency && !enabled.includes(preferredCurrency)) {
        if (body?.enabledCurrencies !== undefined) {
          return NextResponse.json({ error: "Your home currency stays enabled." }, { status: 400 });
        }
        enabled = withHomeCurrency(enabled, preferredCurrency);
      }

      const enabledCurrencies = serializeEnabledCurrencies(enabled);
      db.update(userSettings)
        .set({
          preferredCurrency,
          enabledCurrencies,
          updatedAt: new Date(),
        })
        .where(eq(userSettings.id, "user"))
        .run();

      return toProfile({ ...existing, preferredCurrency, enabledCurrencies });
    }

    const parsed = parseProfileInput({
      name: body?.name,
      email: body?.email,
      avatar: body?.avatar,
      preferredCurrency: body?.preferredCurrency,
    });

    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    let enabled = readEnabledCurrencies(existing?.enabledCurrencies);
    if (body?.enabledCurrencies !== undefined) {
      const parsedEnabled = parseEnabledCurrencies(body.enabledCurrencies);
      if (!parsedEnabled.ok) {
        return NextResponse.json({ error: parsedEnabled.error }, { status: 400 });
      }
      if (
        parsed.profile.preferredCurrency &&
        !parsedEnabled.currencies.includes(parsed.profile.preferredCurrency)
      ) {
        return NextResponse.json({ error: "Your home currency stays enabled." }, { status: 400 });
      }
      enabled = parsedEnabled.currencies;
    }

    const enabledCurrencies = serializeEnabledCurrencies(
      withHomeCurrency(enabled, parsed.profile.preferredCurrency)
    );
    const now = new Date();

    if (!existing) {
      db.insert(userSettings)
        .values({
          id: "user",
          username: parsed.profile.name,
          email: parsed.profile.email,
          avatar: parsed.profile.avatar,
          preferredCurrency: parsed.profile.preferredCurrency,
          enabledCurrencies,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    } else {
      db.update(userSettings)
        .set({
          username: parsed.profile.name,
          email: parsed.profile.email,
          avatar: parsed.profile.avatar,
          preferredCurrency: parsed.profile.preferredCurrency,
          enabledCurrencies,
          updatedAt: now,
        })
        .where(eq(userSettings.id, "user"))
        .run();
    }

    return {
      ...parsed.profile,
      enabledCurrencies: orderWithDefault(
        withHomeCurrency(enabled, parsed.profile.preferredCurrency),
        parsed.profile.preferredCurrency
      ),
    };
  });
};
