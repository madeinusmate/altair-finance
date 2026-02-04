"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { ConnectionProgress } from "@/components/open-banking/connection-progress";
import { AccountSelectionStep } from "@/components/open-banking/account-selection-step";
import { TransactionPreviewStep } from "@/components/open-banking/transaction-preview-step";
import { apiClient } from "@/lib/api-client";
import { createAccountFromFinverseData } from "@/lib/finverse-mapping";
import type { FinverseAccountsResponse, FinverseTransaction } from "@/lib/finverse-types";
import { toast } from "sonner";

type Step = "connecting" | "account-selection" | "transaction-preview" | "creating" | "completed";

const ConnectPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const [accounts, setAccounts] = useState<FinverseAccountsResponse | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>("connecting");
  const [isCreatingAccounts, setIsCreatingAccounts] = useState(false);
  const [existingFinverseAccountNumbers, setExistingFinverseAccountNumbers] = useState<string[]>([]);
  const [selectedAccountsForPreview, setSelectedAccountsForPreview] = useState<any[]>([]);
  const [accountPreviews, setAccountPreviews] = useState<any[]>([]);

  // Fetch existing accounts to check for duplicates
  useEffect(() => {
    const fetchExistingAccounts = async () => {
      try {
        const allAccounts = await apiClient.get<any[]>("/api/accounts");
        const finverseNumbers = allAccounts
          .filter((account: any) => {
            if (!account.metadata) return false;
            try {
              const meta = JSON.parse(account.metadata);
              return meta?.finverse?.account_number_masked;
            } catch {
              return false;
            }
          })
          .map((account: any) => {
            const meta = JSON.parse(account.metadata);
            return meta.finverse.account_number_masked;
          });
        setExistingFinverseAccountNumbers(finverseNumbers);
      } catch (err) {
        console.warn("Failed to fetch existing accounts:", err);
      }
    };
    fetchExistingAccounts();
  }, []);

  // Auto-initiate connection if no code
  useEffect(() => {
    if (!code && !error && !isConnecting) {
      getLinkUiUrl();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch accounts when code is received
  useEffect(() => {
    if (code && !accounts && !loadingAccounts) {
      fetchAccounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Move to account selection when accounts are loaded
  useEffect(() => {
    if (accounts?.accounts && accounts.accounts.length > 0 && currentStep === "connecting") {
      setCurrentStep("account-selection");
    }
  }, [accounts, currentStep]);

  const getLinkUiUrl = async () => {
    setIsConnecting(true);
    setErrorMessage(null);
    try {
      const response = await apiClient.post<{ link_url: string }>("/api/open-banking/get-link-ui-url", {});
      window.location.href = response.link_url;
    } catch (err) {
      console.error("Error getting link URL:", err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to get link URL");
      setIsConnecting(false);
    }
  };

  const fetchAccounts = async () => {
    setLoadingAccounts(true);
    setErrorMessage(null);
    try {
      const accountsData = await apiClient.post<FinverseAccountsResponse>("/api/open-banking/fetch-accounts", {
        code,
      });
      setAccounts(accountsData);
    } catch (err) {
      console.error("Error fetching accounts:", err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to fetch accounts");
      setAccounts(null);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const fetchTransactionPreview = async (selectedAccounts: any[]) => {
    const previews = selectedAccounts.map((selection) => ({
      account: selection.account,
      selection: selection,
      transactions: [] as FinverseTransaction[],
      totalTransactions: 0,
      isLoading: true,
      error: undefined as string | undefined,
    }));

    setAccountPreviews(previews);
    setSelectedAccountsForPreview(selectedAccounts);
    setCurrentStep("transaction-preview");

    // Wait a bit for connection to be established
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Fetch transactions for each account
    for (let i = 0; i < selectedAccounts.length; i++) {
      const selection = selectedAccounts[i];
      const finverseAccount = selection.account;

      try {
        const response = await apiClient.post<{
          transactions: FinverseTransaction[];
          total_transactions: number;
        }>("/api/open-banking/fetch-transactions", {
          accountId: finverseAccount.account_id,
          loginIdentityId: finverseAccount.login_identity_id,
          limit: 100,
          offset: 0,
        });

        setAccountPreviews((prev) =>
          prev.map((preview, index) =>
            index === i
              ? {
                  ...preview,
                  transactions: response.transactions,
                  totalTransactions: response.total_transactions,
                  isLoading: false,
                }
              : preview
          )
        );
      } catch (err) {
        console.error(`Error fetching preview for ${selection.name}:`, err);
        setAccountPreviews((prev) =>
          prev.map((preview, index) =>
            index === i
              ? {
                  ...preview,
                  isLoading: false,
                  error: err instanceof Error ? err.message : "Failed to load transactions",
                }
              : preview
          )
        );
      }
    }
  };

  const handleAccountSelection = async (selectedAccounts: any[]) => {
    await fetchTransactionPreview(selectedAccounts);
  };

  const handlePreviewConfirm = async () => {
    setCurrentStep("creating");
    setIsCreatingAccounts(true);
    setErrorMessage(null);

    try {
      for (let i = 0; i < selectedAccountsForPreview.length; i++) {
        const selection = selectedAccountsForPreview[i];
        const finverseAccount = selection.account;
        const preview = accountPreviews[i];

        // Create account
        const accountData = createAccountFromFinverseData(
          finverseAccount,
          {
            type: selection.type,
            nature: selection.nature,
            category: selection.category,
            name: selection.name,
          },
          finverseAccount.login_identity_id
        );

        const createResponse = await apiClient.post<{ id: string }>("/api/accounts", accountData);
        const accountId = createResponse.id;

        // Import transactions if available
        if (preview.transactions && preview.transactions.length > 0) {
          await apiClient.post("/api/open-banking/import-transactions", {
            accountId,
            transactions: preview.transactions,
            loginIdentityId: finverseAccount.login_identity_id,
          });
        }
      }

      setCurrentStep("completed");
      toast.success("Accounts created successfully!");
      setTimeout(() => {
        router.push("/accounts");
      }, 2000);
    } catch (err) {
      console.error("Error creating accounts:", err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to create accounts");
      setCurrentStep("transaction-preview");
    } finally {
      setIsCreatingAccounts(false);
    }
  };

  const handlePreviewBack = () => {
    setCurrentStep("account-selection");
    setAccountPreviews([]);
    setSelectedAccountsForPreview([]);
  };

  const handleConnectionRetry = () => {
    setErrorMessage(null);
    setCurrentStep("connecting");
    getLinkUiUrl();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex flex-col gap-8 p-6 max-w-6xl mx-auto">
        <div className="text-center pt-8">
          <h1 className="text-3xl font-bold mb-2">Bank Connection Setup</h1>
          <p className="text-muted-foreground">
            Connect your bank accounts securely with Finverse Open Banking
          </p>
        </div>

        <ConnectionProgress currentStep={currentStep} />

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl mx-auto">
            <p className="text-red-800">
              <strong>Error:</strong> {errorMessage}
            </p>
            <Button onClick={handleConnectionRetry} className="mt-3" size="sm">
              Try Again
            </Button>
          </div>
        )}

        {error && errorDescription && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl mx-auto">
            <div className="flex items-center gap-2 text-red-600 mb-2">
              <AlertCircle className="h-5 w-5" />
              <strong>Connection Failed</strong>
            </div>
            <p className="text-red-500">{errorDescription}</p>
            <Button onClick={handleConnectionRetry} className="mt-3" size="sm">
              Try Again
            </Button>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border min-h-[600px]">
          {currentStep === "connecting" && (
            <div className="flex flex-col items-center justify-center h-[600px] p-8">
              {isConnecting || (!code && !errorMessage) ? (
                <div className="text-center space-y-4">
                  <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-600" />
                  <h2 className="text-2xl font-semibold">Connecting to your bank</h2>
                  <p className="text-muted-foreground max-w-md">
                    Please wait while we establish a secure connection with your banking institution...
                  </p>
                </div>
              ) : loadingAccounts ? (
                <div className="text-center space-y-4">
                  <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-600" />
                  <h2 className="text-2xl font-semibold">Loading your accounts</h2>
                  <p className="text-muted-foreground">Retrieving your account information...</p>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <CheckCircle className="h-12 w-12 mx-auto text-green-600" />
                  <h2 className="text-2xl font-semibold text-green-600">Connection Successful!</h2>
                  <p className="text-muted-foreground">Your bank connection has been established</p>
                </div>
              )}
            </div>
          )}

          {currentStep === "account-selection" && accounts?.accounts && (
            <div className="p-8">
              <AccountSelectionStep
                accounts={accounts.accounts}
                onNext={handleAccountSelection}
                onBack={handleConnectionRetry}
                existingFinverseAccountNumbers={existingFinverseAccountNumbers}
              />
            </div>
          )}

          {currentStep === "transaction-preview" && (
            <div className="p-8">
              <TransactionPreviewStep
                accountPreviews={accountPreviews}
                onConfirm={handlePreviewConfirm}
                onBack={handlePreviewBack}
                isLoading={isCreatingAccounts}
              />
            </div>
          )}

          {currentStep === "creating" && (
            <div className="flex flex-col items-center justify-center h-[600px] p-8">
              <div className="text-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-600" />
                <h2 className="text-2xl font-semibold">Creating your accounts</h2>
                <p className="text-muted-foreground max-w-md">
                  Setting up your accounts and importing your transaction history...
                </p>
              </div>
            </div>
          )}

          {currentStep === "completed" && (
            <div className="flex flex-col items-center justify-center h-[600px] p-8">
              <div className="text-center space-y-4">
                <CheckCircle className="h-12 w-12 mx-auto text-green-600" />
                <h2 className="text-2xl font-semibold text-green-600">Setup Complete!</h2>
                <p className="text-muted-foreground max-w-md">
                  Your accounts have been successfully created and transactions imported.
                </p>
                <p className="text-sm text-muted-foreground">Redirecting to your accounts...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConnectPage;
