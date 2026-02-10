"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { ConnectionProgress } from "@/components/open-banking/connection-progress";
import { AccountSelectionStep } from "@/components/open-banking/account-selection-step";
import { TransactionPreviewStep } from "@/components/open-banking/transaction-preview-step";
import { PlaidLinkStep } from "@/components/open-banking/plaid-link-step";
import { apiClient } from "@/lib/api-client";
import { createAccountFromFinverseData } from "@/lib/finverse-mapping";
import { createAccountFromPlaidData } from "@/lib/plaid-mapping";
import type { FinverseAccountsResponse, FinverseTransaction, FinverseAccount } from "@/lib/finverse-types";
import type { PlaidAccount, PlaidTransaction } from "@/lib/plaid-types";
import { toast } from "sonner";
import type { Account } from "@/lib/db/schema";

type Step = "connecting" | "account-selection" | "transaction-preview" | "creating" | "completed";
type Provider = "finverse" | "plaid";

interface AccountSelection {
  account: FinverseAccount;
  name: string;
  type: "balance" | "transaction" | "investment";
  nature: "asset" | "liability";
  category: string;
}

interface AccountPreview {
  account: FinverseAccount;
  selection: AccountSelection;
  transactions: FinverseTransaction[];
  totalTransactions: number;
  isLoading: boolean;
  error?: string;
}

// ------------------------------------------------------------------
// Adapters: normalise Plaid data into the Finverse shapes that the
// shared AccountSelectionStep and TransactionPreviewStep expect.
// ------------------------------------------------------------------

const adaptPlaidAccountToFinverse = (
  plaidAccount: PlaidAccount,
  itemId: string
): FinverseAccount => {
  const subType = plaidAccount.subtype || plaidAccount.type;
  return {
    account_id: plaidAccount.account_id,
    account_name: plaidAccount.name || plaidAccount.official_name || "",
    account_number_masked: plaidAccount.mask || "****",
    account_currency:
      plaidAccount.balances.iso_currency_code ||
      plaidAccount.balances.unofficial_currency_code ||
      "USD",
    account_type: {
      type: plaidAccount.type,
      sub_type: subType ?? "",
    },
    balance: {
      currency:
        plaidAccount.balances.iso_currency_code ||
        plaidAccount.balances.unofficial_currency_code ||
        "USD",
      value: plaidAccount.balances.current ?? plaidAccount.balances.available ?? 0,
      raw: String(plaidAccount.balances.current ?? plaidAccount.balances.available ?? 0),
    },
    balances: plaidAccount.balances.current != null
      ? [
          {
            currency:
              plaidAccount.balances.iso_currency_code ||
              plaidAccount.balances.unofficial_currency_code ||
              "USD",
            value: plaidAccount.balances.current,
            raw: String(plaidAccount.balances.current),
            balance_type: "Current" as const,
          },
        ]
      : [],
    login_identity_id: itemId,
    // Store the original Plaid data so we can pull it out later
    connection_metadata: {
      finverse: {
        login_identity_id: itemId,
        account_id: plaidAccount.account_id,
        connection_status: "active",
        connected_at: new Date().toISOString(),
      },
    },
    // Stash original Plaid account data for account creation
    _plaidOriginal: plaidAccount,
    _plaidItemId: itemId,
    _plaidInstitutionId: plaidAccount.institution_id,
    _plaidInstitutionName: plaidAccount.institution_name,
  } as FinverseAccount & {
    _plaidOriginal: PlaidAccount;
    _plaidItemId: string;
    _plaidInstitutionId?: string;
    _plaidInstitutionName?: string;
  };
};

const adaptPlaidTransactionToFinverse = (
  plaidTx: PlaidTransaction
): FinverseTransaction => {
  const currency = plaidTx.iso_currency_code || plaidTx.unofficial_currency_code || "USD";
  return {
    account_id: plaidTx.account_id,
    amount: {
      currency,
      raw: String(plaidTx.amount),
      // Plaid: positive = money out, negative = money in
      // Finverse: negative = money out, positive = money in
      // Invert so the shared UI shows correctly
      value: -plaidTx.amount,
    },
    created_at: plaidTx.datetime || plaidTx.date,
    description: plaidTx.merchant_name || plaidTx.name,
    posted_date: plaidTx.date,
    transaction_date: plaidTx.authorized_date || plaidTx.date,
    transaction_id: plaidTx.transaction_id,
    transaction_type: plaidTx.transaction_type,
    updated_at: plaidTx.datetime || plaidTx.date,
    is_pending: plaidTx.pending,
    // Stash original Plaid transaction for import
    _plaidOriginal: plaidTx,
  } as FinverseTransaction & { _plaidOriginal: PlaidTransaction };
};

// ------------------------------------------------------------------

const ConnectPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Determine provider – default to finverse for backward compat
  const providerParam = searchParams.get("provider");
  const provider: Provider =
    providerParam === "plaid" ? "plaid" : "finverse";

  // Finverse OAuth params
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Shared state
  const [accounts, setAccounts] = useState<FinverseAccountsResponse | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>("connecting");
  const [isCreatingAccounts, setIsCreatingAccounts] = useState(false);
  const [existingFinverseAccountNumbers, setExistingFinverseAccountNumbers] = useState<string[]>([]);
  const [selectedAccountsForPreview, setSelectedAccountsForPreview] = useState<AccountSelection[]>([]);
  const [accountPreviews, setAccountPreviews] = useState<AccountPreview[]>([]);
  const [isPollingAccounts, setIsPollingAccounts] = useState(false);

  // Plaid-specific state
  const [plaidLinkToken, setPlaidLinkToken] = useState<string | null>(null);
  const [plaidItemId, setPlaidItemId] = useState<string | null>(null);

  // Fetch existing accounts to check for duplicates
  useEffect(() => {
    const fetchExistingAccounts = async () => {
      try {
        const allAccounts = await apiClient.get<Account[]>("/api/accounts");
        const connectedNumbers = allAccounts
          .filter((account) => {
            if (!account.metadata) return false;
            try {
              const meta = JSON.parse(account.metadata);
              // Check both providers
              return (
                (meta?.finverse?.account_number_masked) ||
                (meta?.plaid?.account_id)
              );
            } catch {
              return false;
            }
          })
          .map((account) => {
            const meta = JSON.parse(account.metadata || "{}");
            // Return Finverse masked number or Plaid mask
            return (
              meta?.finverse?.account_number_masked ||
              meta?.plaid?.mask ||
              ""
            );
          })
          .filter((num): num is string => Boolean(num));
        setExistingFinverseAccountNumbers(connectedNumbers);
      } catch (err) {
        console.warn("Failed to fetch existing accounts:", err);
      }
    };
    fetchExistingAccounts();
  }, []);

  // ------- Finverse flow -------

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

  const fetchFinverseAccounts = async (isRetry = false) => {
    if (!isRetry) setLoadingAccounts(true);
    setErrorMessage(null);
    setIsConnecting(false);
    try {
      const accountsData = await apiClient.post<FinverseAccountsResponse>("/api/open-banking/fetch-accounts", { code });
      setAccounts(accountsData);

      const status = accountsData?.login_identity?.status;
      if (status === "DATA_RETRIEVAL_IN_PROGRESS" && (!accountsData.accounts || accountsData.accounts.length === 0)) {
        setIsPollingAccounts(true);
        let attempts = 0;
        const maxAttempts = 20;
        const loginIdentityId = accountsData.login_identity?.login_identity_id;

        if (!loginIdentityId) {
          setIsPollingAccounts(false);
          setErrorMessage("Unable to poll for accounts: missing login identity ID");
          return;
        }

        const pollInterval = setInterval(async () => {
          attempts++;
          try {
            const polledData = await apiClient.post<FinverseAccountsResponse>("/api/open-banking/fetch-accounts", {
              login_identity_id: loginIdentityId,
            });
            const polledStatus = polledData?.login_identity?.status;
            const hasAccounts = polledData?.accounts && polledData.accounts.length > 0;

            if (hasAccounts || (polledStatus && polledStatus !== "DATA_RETRIEVAL_IN_PROGRESS")) {
              clearInterval(pollInterval);
              setIsPollingAccounts(false);
              setAccounts(polledData);
              setCurrentStep("account-selection");
            } else if (attempts >= maxAttempts) {
              clearInterval(pollInterval);
              setIsPollingAccounts(false);
              setErrorMessage("Account data retrieval is taking longer than expected. Please try refreshing the page.");
              setCurrentStep("account-selection");
            }
          } catch (err) {
            console.error("Error polling accounts:", err);
            if (attempts >= maxAttempts) {
              clearInterval(pollInterval);
              setIsPollingAccounts(false);
            }
          }
        }, 3000);

        setCurrentStep("account-selection");
      } else if (accountsData) {
        setCurrentStep("account-selection");
      }
    } catch (err) {
      console.error("Error fetching accounts:", err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to fetch accounts");
      setAccounts(null);
      setIsPollingAccounts(false);
    } finally {
      if (!isRetry) setLoadingAccounts(false);
    }
  };

  // Auto-initiate Finverse if no code and provider is finverse
  useEffect(() => {
    if (provider === "finverse" && !code && !error && !isConnecting) {
      getLinkUiUrl();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch Finverse accounts when code arrives
  useEffect(() => {
    if (provider === "finverse" && code && !accounts && !loadingAccounts) {
      setIsConnecting(false);
      fetchFinverseAccounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // ------- Plaid flow -------

  const createPlaidLinkToken = async () => {
    setIsConnecting(true);
    setErrorMessage(null);
    try {
      const response = await apiClient.post<{ link_token: string }>(
        "/api/open-banking/plaid/create-link-token",
        {}
      );
      setPlaidLinkToken(response.link_token);
    } catch (err) {
      console.error("Error creating Plaid link token:", err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to initialize Plaid");
      setIsConnecting(false);
    }
  };

  const handlePlaidSuccess = useCallback(
    async (
      publicToken: string,
      metadata: { institution?: { name: string; institution_id: string } }
    ) => {
      setLoadingAccounts(true);
      setErrorMessage(null);
      try {
        const exchangeResponse = await apiClient.post<{
          accounts: PlaidAccount[];
          item_id: string;
          institution: { institution_id: string | null; institution_name: string };
        }>("/api/open-banking/plaid/exchange-token", {
          public_token: publicToken,
        });

        const itemId = exchangeResponse.item_id;
        setPlaidItemId(itemId);

        // Adapt Plaid accounts to Finverse shape for reuse of UI components
        const adaptedAccounts: FinverseAccount[] = exchangeResponse.accounts.map(
          (acc) =>
            adaptPlaidAccountToFinverse({
              ...acc,
              institution_id: exchangeResponse.institution.institution_id || metadata.institution?.institution_id,
              institution_name: exchangeResponse.institution.institution_name || metadata.institution?.name,
            }, itemId)
        );

        const response: FinverseAccountsResponse = {
          accounts: adaptedAccounts,
          login_identity: {
            login_identity_id: itemId,
            status: "ACTIVE",
          },
          institution: {
            institution_id: exchangeResponse.institution.institution_id || "",
            institution_name: exchangeResponse.institution.institution_name || "",
          },
        };

        setAccounts(response);
        setCurrentStep("account-selection");
      } catch (err) {
        console.error("Error exchanging Plaid token:", err);
        setErrorMessage(err instanceof Error ? err.message : "Failed to connect bank");
      } finally {
        setLoadingAccounts(false);
      }
    },
    []
  );

  const handlePlaidExit = useCallback(
    (error?: { error_code: string; error_message: string } | null) => {
      if (error) {
        setErrorMessage(error.error_message || "Connection was cancelled");
      } else {
        // User closed without error – go back
        router.push("/accounts");
      }
      setIsConnecting(false);
    },
    [router]
  );

  // Auto-initiate Plaid link token
  useEffect(() => {
    if (provider === "plaid" && !plaidLinkToken) {
      createPlaidLinkToken();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------- Shared flow (both providers) -------

  // Move to account selection when accounts are loaded
  useEffect(() => {
    if (accounts !== null && currentStep === "connecting") {
      setCurrentStep("account-selection");
    }
  }, [accounts, currentStep]);

  const fetchTransactionPreview = async (selectedAccounts: AccountSelection[]) => {
    const previews: AccountPreview[] = selectedAccounts.map((selection) => ({
      account: selection.account,
      selection,
      transactions: [] as FinverseTransaction[],
      totalTransactions: 0,
      isLoading: true,
      error: undefined,
    }));

    setAccountPreviews(previews);
    setSelectedAccountsForPreview(selectedAccounts);
    setCurrentStep("transaction-preview");

    // Wait a bit for connection to be established
    await new Promise((resolve) => setTimeout(resolve, 2000));

    for (let i = 0; i < selectedAccounts.length; i++) {
      const selection = selectedAccounts[i];
      const account = selection.account;

      try {
        toast.info(`Fetching transactions for ${selection.name}...`);

        let transactions: FinverseTransaction[] = [];
        let totalTransactions = 0;

        if (provider === "plaid") {
          // Plaid fetch
          const response = await apiClient.post<{
            transactions: PlaidTransaction[];
            total_transactions: number;
          }>("/api/open-banking/plaid/fetch-transactions", {
            itemId: plaidItemId,
            accountId: account.account_id,
            count: 100,
            offset: 0,
          });

          transactions = (response.transactions || []).map(adaptPlaidTransactionToFinverse);
          totalTransactions = response.total_transactions || transactions.length;
        } else {
          // Finverse fetch
          const response = await apiClient.post<{
            transactions: FinverseTransaction[];
            total_transactions: number;
          }>("/api/open-banking/fetch-transactions", {
            accountId: account.account_id,
            loginIdentityId: account.login_identity_id,
            limit: 100,
            offset: 0,
          });

          transactions = Array.isArray(response?.transactions)
            ? response.transactions
            : [];
          totalTransactions =
            typeof response?.total_transactions === "number"
              ? response.total_transactions
              : transactions.length;
        }

        toast.success(`Found ${transactions.length} transactions for ${selection.name}`);

        setAccountPreviews((prev) =>
          prev.map((preview, index) =>
            index === i
              ? { ...preview, transactions, totalTransactions, isLoading: false, error: undefined }
              : preview
          )
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load transactions";
        toast.error(`Error: ${msg}`);

        setAccountPreviews((prev) =>
          prev.map((preview, index) =>
            index === i ? { ...preview, isLoading: false, error: msg } : preview
          )
        );
      }
    }
  };

  const handleAccountSelection = async (selectedAccounts: AccountSelection[]) => {
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

        let accountData: {
          name: string;
          type: "balance" | "transaction" | "investment";
          nature: "asset" | "liability";
          category: string;
          currency: string;
          initialBalance: number;
          metadata: string;
        };

        if (provider === "plaid") {
          // Extract original Plaid data from the adapted Finverse account
          const plaidAccount =
            (finverseAccount as FinverseAccount & { _plaidOriginal?: PlaidAccount })._plaidOriginal;
          const pItemId =
            (finverseAccount as FinverseAccount & { _plaidItemId?: string })._plaidItemId || plaidItemId || "";
          const pInstitutionId =
            (finverseAccount as FinverseAccount & { _plaidInstitutionId?: string })._plaidInstitutionId;
          const pInstitutionName =
            (finverseAccount as FinverseAccount & { _plaidInstitutionName?: string })._plaidInstitutionName;

          if (plaidAccount) {
            accountData = createAccountFromPlaidData(
              plaidAccount,
              {
                type: selection.type,
                nature: selection.nature,
                category: selection.category,
                name: selection.name,
              },
              pItemId,
              pInstitutionId,
              pInstitutionName
            );
          } else {
            // Fallback if original data is missing
            accountData = createAccountFromFinverseData(
              finverseAccount,
              {
                type: selection.type,
                nature: selection.nature,
                category: selection.category,
                name: selection.name,
              },
              finverseAccount.login_identity_id
            );
          }
        } else {
          accountData = createAccountFromFinverseData(
            finverseAccount,
            {
              type: selection.type,
              nature: selection.nature,
              category: selection.category,
              name: selection.name,
            },
            finverseAccount.login_identity_id
          );
        }

        const createResponse = await apiClient.post<{ id: string }>("/api/accounts", accountData);
        const accountId = createResponse.id;

        // Import transactions if available
        if (preview.transactions && preview.transactions.length > 0) {
          if (provider === "plaid") {
            // Extract original Plaid transactions and import via the Plaid import route
            const plaidTransactions = preview.transactions.map((tx) => {
              const original = (tx as FinverseTransaction & { _plaidOriginal?: PlaidTransaction })._plaidOriginal;
              return original || tx;
            });

            await apiClient.post("/api/open-banking/plaid/import-transactions", {
              accountId,
              transactions: plaidTransactions,
              itemId: plaidItemId,
            });
          } else {
            await apiClient.post("/api/open-banking/import-transactions", {
              accountId,
              transactions: preview.transactions,
              loginIdentityId: finverseAccount.login_identity_id,
            });
          }
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
    if (provider === "plaid") {
      setPlaidLinkToken(null);
      createPlaidLinkToken();
    } else {
      getLinkUiUrl();
    }
  };

  // ------- Render -------

  const providerDisplayName = provider === "plaid" ? "Plaid" : "Finverse";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bank Connection Setup</h1>
        <p className="text-muted-foreground">
          Connect your bank accounts securely with {providerDisplayName}
        </p>
      </div>

      {errorMessage && (
        <Alert variant="destructive" className="max-w-2xl">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {errorMessage}
            <Button onClick={handleConnectionRetry} className="mt-3" size="sm" variant="outline">
              Try Again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {error && errorDescription && (
        <Alert variant="destructive" className="max-w-2xl">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Connection Failed</AlertTitle>
          <AlertDescription>
            {errorDescription}
            <Button onClick={handleConnectionRetry} className="mt-3" size="sm" variant="outline">
              Try Again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card className="min-h-[600px]">
        <CardContent className="p-8">
          {currentStep === "connecting" && (
            <>
              {provider === "plaid" && plaidLinkToken ? (
                <PlaidLinkStep
                  linkToken={plaidLinkToken}
                  onSuccess={handlePlaidSuccess}
                  onExit={handlePlaidExit}
                />
              ) : provider === "plaid" && !plaidLinkToken ? (
                <div className="flex flex-col items-center justify-center min-h-[600px]">
                  <div className="text-center space-y-4">
                    <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                    <h2 className="text-2xl font-semibold">Preparing Plaid Link</h2>
                    <p className="text-muted-foreground max-w-md">
                      Setting up a secure connection...
                    </p>
                  </div>
                </div>
              ) : (
                // Finverse connecting state
                <div className="flex flex-col items-center justify-center min-h-[600px]">
                  {isConnecting || (!code && !errorMessage) ? (
                    <div className="text-center space-y-4">
                      <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                      <h2 className="text-2xl font-semibold">Connecting to your bank</h2>
                      <p className="text-muted-foreground max-w-md">
                        Please wait while we establish a secure connection with your banking institution...
                      </p>
                    </div>
                  ) : loadingAccounts ? (
                    <div className="text-center space-y-4">
                      <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                      <h2 className="text-2xl font-semibold">Loading your accounts</h2>
                      <p className="text-muted-foreground">Retrieving your account information...</p>
                    </div>
                  ) : accounts && accounts.accounts && accounts.accounts.length > 0 ? (
                    <div className="text-center space-y-4">
                      <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                      <h2 className="text-2xl font-semibold">Preparing account selection...</h2>
                      <p className="text-muted-foreground">Loading your accounts...</p>
                    </div>
                  ) : (
                    <div className="text-center space-y-4">
                      <CheckCircle className="h-12 w-12 mx-auto text-primary" />
                      <h2 className="text-2xl font-semibold text-primary">Connection Successful!</h2>
                      <p className="text-muted-foreground">Your bank connection has been established</p>
                      {code && !loadingAccounts && !accounts && (
                        <p className="text-sm text-muted-foreground mt-2">Waiting for accounts to load...</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {currentStep === "account-selection" && accounts !== null && (
            <>
              {isPollingAccounts && (
                <div className="mb-6">
                  <Alert>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <AlertTitle>Retrieving Account Data</AlertTitle>
                    <AlertDescription>
                      Your bank connection is successful. We&apos;re currently retrieving your account information
                      from {accounts.institution?.institution_name || "your bank"}. This may take a few moments...
                    </AlertDescription>
                  </Alert>
                </div>
              )}
              <AccountSelectionStep
                accounts={accounts.accounts || []}
                onNext={handleAccountSelection}
                onBack={handleConnectionRetry}
                existingFinverseAccountNumbers={existingFinverseAccountNumbers}
              />
            </>
          )}

          {currentStep === "transaction-preview" && (
            <TransactionPreviewStep
              accountPreviews={accountPreviews}
              onConfirm={handlePreviewConfirm}
              onBack={handlePreviewBack}
              isLoading={isCreatingAccounts}
            />
          )}

          {currentStep === "creating" && (
            <div className="flex flex-col items-center justify-center min-h-[600px]">
              <div className="text-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                <h2 className="text-2xl font-semibold">Creating your accounts</h2>
                <p className="text-muted-foreground max-w-md">
                  Setting up your accounts and importing your transaction history...
                </p>
              </div>
            </div>
          )}

          {currentStep === "completed" && (
            <div className="flex flex-col items-center justify-center min-h-[600px]">
              <div className="text-center space-y-4">
                <CheckCircle className="h-12 w-12 mx-auto text-primary" />
                <h2 className="text-2xl font-semibold text-primary">Setup Complete!</h2>
                <p className="text-muted-foreground max-w-md">
                  Your accounts have been successfully created and transactions imported.
                </p>
                <p className="text-sm text-muted-foreground">Redirecting to your accounts...</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ConnectPage;
