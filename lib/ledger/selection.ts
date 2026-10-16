export const ledgerSelectionKey = (kind: "transaction" | "transfer", id: string): string =>
  `${kind}:${id}`;

export type LedgerSelectionEntry = {
  key: string;
  id: string;
  kind: "transaction" | "transfer";
  type?: "debit" | "credit";
};

export const toLedgerSelection = (
  item:
    | { type: "transaction"; data: { id: string; type: "debit" | "credit" } }
    | { type: "transfer"; data: { id: string } }
): LedgerSelectionEntry => {
  if (item.type === "transaction") {
    return {
      key: ledgerSelectionKey("transaction", item.data.id),
      id: item.data.id,
      kind: "transaction",
      type: item.data.type,
    };
  }

  return {
    key: ledgerSelectionKey("transfer", item.data.id),
    id: item.data.id,
    kind: "transfer",
  };
};

export const headerCheckboxState = (
  selectableKeys: string[],
  selectedKeys: ReadonlySet<string>
): boolean | "indeterminate" => {
  if (selectableKeys.length === 0) {
    return false;
  }

  let selected = 0;
  for (const key of selectableKeys) {
    if (selectedKeys.has(key)) {
      selected += 1;
    }
  }

  if (selected === 0) {
    return false;
  }
  if (selected === selectableKeys.length) {
    return true;
  }
  return "indeterminate";
};

export const toggleFilteredSelection = (
  current: ReadonlyMap<string, LedgerSelectionEntry>,
  selectable: LedgerSelectionEntry[],
  selectAll: boolean
): Map<string, LedgerSelectionEntry> => {
  const next = new Map(current);
  if (selectAll) {
    for (const row of selectable) {
      next.set(row.key, row);
    }
    return next;
  }

  for (const row of selectable) {
    next.delete(row.key);
  }
  return next;
};
