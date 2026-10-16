"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EnabledCurrencies } from "@/components/settings/enabled-currencies";

const CurrenciesPage = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-[34px] font-semibold tracking-[-0.03em]">Currencies</h1>
          <p className="text-muted-foreground">Choose which currencies appear on Home and Budget</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Enabled currencies</CardTitle>
          <CardDescription>The default stays enabled and leads this list. Home and Budget open in it.</CardDescription>
        </CardHeader>
        <CardContent>
          <EnabledCurrencies />
        </CardContent>
      </Card>
    </div>
  );
};

export default CurrenciesPage;
