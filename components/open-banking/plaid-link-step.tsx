"use client";

import { useCallback, useEffect } from "react";
import { usePlaidLink, PlaidLinkOnSuccess, PlaidLinkOnExit } from "react-plaid-link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PlaidLinkStepProps {
  linkToken: string;
  onSuccess: (publicToken: string, metadata: { institution?: { name: string; institution_id: string } }) => void;
  onExit: (error?: { error_code: string; error_message: string } | null) => void;
}

export const PlaidLinkStep = ({
  linkToken,
  onSuccess,
  onExit,
}: PlaidLinkStepProps) => {
  const handleSuccess = useCallback<PlaidLinkOnSuccess>(
    (publicToken, metadata) => {
      onSuccess(publicToken, {
        institution: metadata.institution
          ? {
              name: metadata.institution.name,
              institution_id: metadata.institution.institution_id,
            }
          : undefined,
      });
    },
    [onSuccess]
  );

  const handleExit = useCallback<PlaidLinkOnExit>(
    (error) => {
      onExit(
        error
          ? {
              error_code: error.error_code,
              error_message: error.error_message,
            }
          : null
      );
    },
    [onExit]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: handleSuccess,
    onExit: handleExit,
  });

  // Open Plaid Link automatically when ready
  useEffect(() => {
    if (ready) {
      open();
    }
  }, [ready, open]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[600px]">
      <div className="text-center space-y-4">
        {!ready ? (
          <>
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <h2 className="text-2xl font-semibold">Preparing Plaid Link</h2>
            <p className="text-muted-foreground max-w-md">
              Setting up a secure connection to your bank...
            </p>
          </>
        ) : (
          <>
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <h2 className="text-2xl font-semibold">Connecting to your bank</h2>
            <p className="text-muted-foreground max-w-md">
              Please complete the authentication in the Plaid window. If the
              window didn&apos;t open, click the button below.
            </p>
            <Button onClick={() => open()} variant="outline" className="mt-4">
              Open Plaid Link
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
