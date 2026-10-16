export const PAYEE_PAGE_MAX = 100;

export type PayeeListQuery = {
  limit: number | null;
  offset: number;
  q: string;
  summary: boolean;
};

export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export const payeeLikePattern = (q: string): string | null => {
  const trimmed = q.trim().toLowerCase();
  if (!trimmed) return null;
  return `%${escapeLike(trimmed)}%`;
};

const integerParam = (value: string | null): number | null => {
  if (value === null || value === "") return null;
  if (!/^\d+$/.test(value)) return Number.NaN;
  return Number(value);
};

export const parsePayeeListQuery = (params: URLSearchParams): PayeeListQuery | { error: string } => {
  const limit = integerParam(params.get("limit"));
  if (Number.isNaN(limit)) return { error: "limit must be an integer from 1 to 100" };
  if (limit !== null && (limit < 1 || limit > PAYEE_PAGE_MAX)) {
    return { error: "limit must be an integer from 1 to 100" };
  }

  const offset = integerParam(params.get("offset")) ?? 0;
  if (Number.isNaN(offset)) return { error: "offset must be a non-negative integer" };

  return {
    limit,
    offset,
    q: (params.get("q") ?? "").trim().slice(0, 80),
    summary: params.get("view") === "summary",
  };
};
