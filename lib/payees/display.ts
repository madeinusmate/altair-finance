export const transactionTitle = (payeeName: string | null | undefined, description: string | null | undefined, category: string): string => {
  const payee = payeeName?.trim();
  if (payee) return payee;
  const line = description?.trim();
  if (line) return line;
  return category;
};

export const transactionSubtitle = (
  payeeName: string | null | undefined,
  description: string | null | undefined
): string | null => {
  const payee = payeeName?.trim();
  const line = description?.trim();
  if (!payee || !line || payee === line) return null;
  return line;
};
