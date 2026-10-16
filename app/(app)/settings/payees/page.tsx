"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PayeesSettings } from "@/components/payees/payees-settings";

const PayeesPage = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-[34px] font-semibold tracking-[-0.03em]">Payee Management</h1>
          <p className="text-muted-foreground">Rename payees, set icons, or merge duplicates</p>
        </div>
      </div>

      <PayeesSettings />
    </div>
  );
};

export default PayeesPage;
