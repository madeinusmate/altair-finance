import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ParseError, ParseResult, ParsedTransaction } from "./types";

type PdfTextContent = { items: unknown[] };

type PdfPageProxy = {
  getTextContent: () => Promise<PdfTextContent>;
};

type PdfDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  destroy: () => Promise<void>;
};

type PdfLibrary = {
  getDocument: (src: {
    data: Uint8Array;
    isEvalSupported?: boolean;
    useWasm?: boolean;
    disableFontFace?: boolean;
    verbosity?: number;
    standardFontDataUrl?: string;
  }) => { promise: Promise<PdfDocumentProxy> };
  GlobalWorkerOptions: { workerSrc: string };
  PasswordResponses: { NEED_PASSWORD: number; INCORRECT_PASSWORD: number };
  VerbosityLevel: { ERRORS: number };
};

type PdfWorkerModule = {
  WorkerMessageHandler: {
    setup: (handler: unknown, port: unknown) => void;
  };
};

type PdfScope = typeof globalThis & {
  pdfjsWorker?: Pick<PdfWorkerModule, "WorkerMessageHandler">;
};

// Turbopack rewrites import() inside the route bundle, so PDF.js would look for
// its worker at a virtual [project] path. Load the real files by specifier at runtime.
const importUntouched = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<PdfLibrary & PdfWorkerModule>;

const resolvePackageFile = (specifier: string): string => {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  return require.resolve(specifier);
};

const standardFontDataUrl = (): string => {
  const fontDirectory = path.join(path.dirname(resolvePackageFile("pdfjs-dist/package.json")), "standard_fonts");
  const fontUrl = pathToFileURL(fontDirectory).href;
  return fontUrl.endsWith("/") ? fontUrl : `${fontUrl}/`;
};

let pdfLibrary: Promise<PdfLibrary> | null = null;
let needPasswordCode = 1;
let incorrectPasswordCode = 2;

const loadPdfLibrary = (): Promise<PdfLibrary> => {
  if (!pdfLibrary) {
    pdfLibrary = (async () => {
      const workerHref = pathToFileURL(resolvePackageFile("pdfjs-dist/legacy/build/pdf.worker.mjs")).href;
      const pdfHref = pathToFileURL(resolvePackageFile("pdfjs-dist/legacy/build/pdf.mjs")).href;
      const worker = await importUntouched(workerHref);
      (globalThis as PdfScope).pdfjsWorker = { WorkerMessageHandler: worker.WorkerMessageHandler };
      const pdfjs = await importUntouched(pdfHref);
      pdfjs.GlobalWorkerOptions.workerSrc = workerHref;
      needPasswordCode = pdfjs.PasswordResponses.NEED_PASSWORD;
      incorrectPasswordCode = pdfjs.PasswordResponses.INCORRECT_PASSWORD;
      return pdfjs;
    })().catch((error: unknown) => {
      pdfLibrary = null;
      throw error;
    });
  }
  return pdfLibrary;
};

const Y_TOLERANCE = 2;
const AMBIGUOUS_DATE_WARNING = "Ambiguous date; confirm YYYY-MM-DD";
const ASSUMED_DEBIT_WARNING = "Type assumed debit";
const EXTRA_AMOUNT_WARNING = "Extra amount ignored; confirm this row";
const BOTH_COLUMNS_WARNING = "Both debit and credit amounts present; confirm this row";

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const AMOUNT_PATTERN =
  /(?<![A-Za-z0-9])(?:USD|EUR|GBP|AUD|CAD|HKD|SGD|JPY|CNY|CHF|NZD|MYR|THB|TWD|KRW|[$£€¥])?\s*-?\(?\d+(?:,\d{3})*(?:\.\d{2})\)?(?:\s*(?:CR|DR))?|(?<![A-Za-z0-9])\(\s*\d+(?:,\d{3})*(?:\.\d{2})?\s*\)/gi;

const SKIP_LINE =
  /opening balance|closing balance|statement period|running balance|\bpage\s+\d+\s+of\b|^page\s+\d+$/i;

type DateOrder = "DMY" | "MDY";

type TextPiece = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
};

export type StatementCell = {
  x: number;
  text: string;
};

export type StatementLine = {
  page: number;
  cells: StatementCell[];
};

type ColumnRole = "date" | "description" | "debit" | "credit" | "amount" | "balance" | "other";

type HeaderColumn = {
  x: number;
  role: ColumnRole;
};

type FoundDate = {
  raw: string;
  iso: string | null;
  ambiguous: boolean;
  impliedOrder: DateOrder | null;
  index: number;
  length: number;
};

type ParsedAmount = {
  value: number;
  marker: "debit" | "credit" | null;
  index: number;
  length: number;
};

type StatementMeta = {
  filename: string;
  fileSize: number;
};

const normalizeSpace = (value: string): string => value.replace(/\s+/g, " ").trim();

const pad2 = (value: number): string => String(value).padStart(2, "0");

const toIso = (year: number, month: number, day: number): string | null => {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1000 || year > 9999) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
};

const blankSpan = (text: string, index: number, length: number): string =>
  `${text.slice(0, index)}${" ".repeat(length)}${text.slice(index + length)}`;

const isPasswordError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; code?: number };
  if (candidate.name === "PasswordException") return true;
  const passwordCode = candidate.code === needPasswordCode || candidate.code === incorrectPasswordCode;
  return passwordCode && typeof candidate.name === "string" && candidate.name.toLowerCase().includes("password");
};

const isTextItem = (
  item: unknown
): item is { str: string; transform: number[]; width: number; height: number } => {
  if (!item || typeof item !== "object") return false;
  const candidate = item as { str?: unknown; transform?: unknown; width?: unknown; height?: unknown };
  return typeof candidate.str === "string" && Array.isArray(candidate.transform);
};

const resolveNumericDate = (
  first: number,
  second: number,
  year: number,
  order: DateOrder | null
): { iso: string | null; ambiguous: boolean; impliedOrder: DateOrder | null } => {
  if (first > 12 && second > 12) {
    return { iso: null, ambiguous: false, impliedOrder: null };
  }
  if (first > 12) {
    return { iso: toIso(year, second, first), ambiguous: false, impliedOrder: "DMY" };
  }
  if (second > 12) {
    return { iso: toIso(year, first, second), ambiguous: false, impliedOrder: "MDY" };
  }
  if (order === "DMY") {
    return { iso: toIso(year, second, first), ambiguous: false, impliedOrder: "DMY" };
  }
  if (order === "MDY") {
    return { iso: toIso(year, first, second), ambiguous: false, impliedOrder: "MDY" };
  }
  return { iso: null, ambiguous: true, impliedOrder: null };
};

const findDate = (text: string, order: DateOrder | null): FoundDate | null => {
  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch?.index !== undefined) {
    const iso = toIso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    if (iso) {
      return {
        raw: isoMatch[0],
        iso,
        ambiguous: false,
        impliedOrder: null,
        index: isoMatch.index,
        length: isoMatch[0].length,
      };
    }
  }

  const dayMonth = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/);
  if (dayMonth?.index !== undefined) {
    const month = MONTHS[dayMonth[2].toLowerCase()];
    const iso = month ? toIso(Number(dayMonth[3]), month, Number(dayMonth[1])) : null;
    if (iso) {
      return {
        raw: dayMonth[0],
        iso,
        ambiguous: false,
        impliedOrder: null,
        index: dayMonth.index,
        length: dayMonth[0].length,
      };
    }
  }

  const monthDay = text.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (monthDay?.index !== undefined) {
    const month = MONTHS[monthDay[1].toLowerCase()];
    const iso = month ? toIso(Number(monthDay[3]), month, Number(monthDay[2])) : null;
    if (iso) {
      return {
        raw: monthDay[0],
        iso,
        ambiguous: false,
        impliedOrder: null,
        index: monthDay.index,
        length: monthDay[0].length,
      };
    }
  }

  const numeric = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (numeric?.index !== undefined) {
    const resolved = resolveNumericDate(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]), order);
    if (resolved.ambiguous || resolved.iso) {
      return {
        raw: numeric[0],
        iso: resolved.iso,
        ambiguous: resolved.ambiguous,
        impliedOrder: resolved.impliedOrder,
        index: numeric.index,
        length: numeric[0].length,
      };
    }
  }

  return null;
};

const parseAmountToken = (raw: string): ParsedAmount | null => {
  const source = raw.trim();
  if (!source || !/\d/.test(source)) return null;

  const letters = source.replace(/\b(CR|DR|USD|EUR|GBP|AUD|CAD|HKD|SGD|JPY|CNY|CHF|NZD|MYR|THB|TWD|KRW)\b/gi, "");
  if (/[A-Za-z]/.test(letters)) return null;

  let marker: "debit" | "credit" | null = null;
  let working = source;
  if (/\(\s*[^)]+\s*\)/.test(working)) {
    marker = "credit";
    working = working.replace(/[()]/g, "");
  }
  if (/\bCR\b/i.test(working) || /CR\s*$/i.test(working)) {
    marker = "credit";
    working = working.replace(/CR/i, "");
  } else if (/\bDR\b/i.test(working) || /DR\s*$/i.test(working)) {
    marker = marker ?? "debit";
    working = working.replace(/DR/i, "");
  }

  working = working.replace(/[$£€¥]/g, "");
  working = working.replace(/\b(USD|EUR|GBP|AUD|CAD|HKD|SGD|JPY|CNY|CHF|NZD|MYR|THB|TWD|KRW)\b/gi, "");
  working = normalizeSpace(working);

  if (/^\d[\d,]*-\s*$/.test(working)) {
    marker = marker ?? "credit";
    working = working.replace(/-\s*$/, "");
  }
  if (working.startsWith("-")) {
    marker = marker ?? "credit";
    working = working.slice(1).trim();
  }

  working = working.replace(/\s/g, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(working)) {
    working = working.replace(/,/g, "");
  } else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(working)) {
    working = working.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+,\d{1,2}$/.test(working)) {
    working = working.replace(",", ".");
  } else {
    working = working.replace(/,/g, "");
  }

  const value = Number(working);
  if (!Number.isFinite(value) || value <= 0) return null;

  const index = raw.indexOf(source);
  return {
    value,
    marker,
    index: index < 0 ? 0 : index,
    length: source.length,
  };
};

const findAmounts = (text: string): ParsedAmount[] => {
  const amounts: ParsedAmount[] = [];
  const pattern = new RegExp(AMOUNT_PATTERN.source, "gi");
  let match = pattern.exec(text);
  while (match) {
    const parsed = parseAmountToken(match[0]);
    if (parsed) {
      amounts.push({
        ...parsed,
        index: match.index,
        length: match[0].length,
      });
    }
    if (match[0].length === 0) pattern.lastIndex += 1;
    match = pattern.exec(text);
  }
  return amounts;
};

const isSkippableLine = (text: string): boolean => {
  const normalized = normalizeSpace(text);
  if (!normalized) return true;
  if (SKIP_LINE.test(normalized)) return true;
  const withoutNumbers = normalizeSpace(normalized.replace(new RegExp(AMOUNT_PATTERN.source, "gi"), ""));
  return /^balance$/i.test(withoutNumbers);
};

const looksLikeHeaderLabel = (text: string): boolean => {
  const normalized = normalizeSpace(text);
  if (!normalized || normalized.length > 48) return false;
  if (findDate(normalized, null)) return false;
  if (parseAmountToken(normalized)) return false;
  return true;
};

const classifyHeaderCell = (text: string): ColumnRole => {
  const normalized = text.toLowerCase();
  const hasDate = /\b(trans\s*date|posted|date)\b/.test(normalized);
  const hasBalance = /\bbalances?\b/.test(normalized);
  const hasDebit = /\b(withdrawals?|debits?|charges?)\b/.test(normalized);
  const hasCredit = /\b(deposits?|credits?)\b/.test(normalized);
  const hasAmount = /\bamounts?\b/.test(normalized);
  const hasDescription = /\b(description|details|narrative|particulars|memo|payee|merchant)\b/.test(normalized);

  if (hasDate && !hasDebit && !hasCredit && !hasAmount) return "date";
  if (hasBalance && !hasDebit && !hasCredit && !hasAmount) return "balance";
  if (hasDebit && hasCredit) return "amount";
  if (hasDebit) return "debit";
  if (hasCredit) return "credit";
  if (hasAmount) return "amount";
  if (hasDescription) return "description";
  return "other";
};

const headerColumns = (line: StatementLine): HeaderColumn[] | null => {
  if (line.cells.length < 2) return null;
  if (line.cells.some((cell) => !looksLikeHeaderLabel(cell.text))) return null;
  const columns = line.cells.map((cell) => ({
    x: cell.x,
    role: classifyHeaderCell(cell.text),
  }));
  const hasDate = columns.some((column) => column.role === "date");
  const hasValue = columns.some(
    (column) => column.role === "debit" || column.role === "credit" || column.role === "amount"
  );
  if (!hasDate || !hasValue) return null;
  return columns;
};

const nextDateOrder = (current: DateOrder | null, found: FoundDate | null): DateOrder | null => {
  if (!found || found.ambiguous || !found.impliedOrder) return current;
  return current ?? found.impliedOrder;
};

const buildTransaction = (
  foundDate: FoundDate,
  description: string,
  value: number,
  type: "debit" | "credit",
  explicitType: boolean,
  extraWarnings: string[] = []
): ParsedTransaction => {
  const warnings = [...extraWarnings];
  let nextDescription = description;
  if (foundDate.ambiguous) {
    warnings.push(AMBIGUOUS_DATE_WARNING);
    if (!nextDescription.includes(foundDate.raw)) {
      nextDescription = normalizeSpace(`${foundDate.raw} ${nextDescription}`);
    }
  }
  if (!explicitType && type === "debit") {
    warnings.push(ASSUMED_DEBIT_WARNING);
  }
  const transaction: ParsedTransaction = {
    date: foundDate.ambiguous ? foundDate.raw : foundDate.iso || foundDate.raw,
    description: nextDescription,
    amount: value,
    category: "",
    type,
  };
  if (warnings.length > 0) transaction.warnings = warnings;
  return transaction;
};

const amountFromMarker = (
  parsed: ParsedAmount,
  columnType: "debit" | "credit" | null
): { type: "debit" | "credit"; explicit: boolean } => {
  if (parsed.marker) return { type: parsed.marker, explicit: true };
  if (columnType) return { type: columnType, explicit: true };
  return { type: "debit", explicit: false };
};

type LineExtraction =
  | { kind: "continuation"; text: string }
  | { kind: "transaction"; transaction: ParsedTransaction; dateOrder: DateOrder | null }
  | null;

const extractFromLine = (lineText: string, dateOrder: DateOrder | null): LineExtraction => {
  const text = normalizeSpace(lineText);
  if (!text) return null;
  const foundDate = findDate(text, dateOrder);
  const working = foundDate ? blankSpan(text, foundDate.index, foundDate.length) : text;
  const amounts = findAmounts(working);
  if (!foundDate) {
    if (amounts.length === 0) return { kind: "continuation", text };
    return null;
  }
  if (!foundDate.ambiguous && !foundDate.iso) return null;
  if (amounts.length === 0) return null;

  const amount = amounts[0];
  const typed = amountFromMarker(amount, null);
  let description = blankSpan(working, amount.index, amount.length);
  for (let index = amounts.length - 1; index >= 1; index -= 1) {
    description = blankSpan(description, amounts[index].index, amounts[index].length);
  }
  const extraWarnings = amounts.length > 1 ? [EXTRA_AMOUNT_WARNING] : [];
  return {
    kind: "transaction",
    dateOrder: nextDateOrder(dateOrder, foundDate),
    transaction: buildTransaction(
      foundDate,
      normalizeSpace(description),
      amount.value,
      typed.type,
      typed.explicit,
      extraWarnings
    ),
  };
};

const textForRoles = (
  columns: HeaderColumn[],
  buckets: Map<number, string[]>,
  roles: ColumnRole[]
): string => {
  const parts: string[] = [];
  columns.forEach((column, index) => {
    if (!roles.includes(column.role)) return;
    const bucket = buckets.get(index);
    if (bucket) parts.push(...bucket);
  });
  return normalizeSpace(parts.join(" "));
};

const extractWithColumns = (
  line: StatementLine,
  columns: HeaderColumn[],
  dateOrder: DateOrder | null
): LineExtraction => {
  const buckets = new Map<number, string[]>();
  for (const cell of line.cells) {
    let bestIndex = 0;
    let bestDistance = Math.abs(cell.x - columns[0].x);
    for (let index = 1; index < columns.length; index += 1) {
      const distance = Math.abs(cell.x - columns[index].x);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    const existing = buckets.get(bestIndex) ?? [];
    existing.push(cell.text);
    buckets.set(bestIndex, existing);
  }

  const lineText = normalizeSpace(line.cells.map((cell) => cell.text).join(" "));
  const dateText = textForRoles(columns, buckets, ["date"]);
  const description = textForRoles(columns, buckets, ["description", "other"]);
  const debitText = textForRoles(columns, buckets, ["debit"]);
  const creditText = textForRoles(columns, buckets, ["credit"]);
  const amountText = textForRoles(columns, buckets, ["amount"]);

  const foundInColumn = dateText ? findDate(dateText, dateOrder) : null;
  const foundDate = foundInColumn ?? findDate(lineText, dateOrder);
  const debitAmount = parseAmountToken(debitText);
  const creditAmount = parseAmountToken(creditText);
  const singleAmount = parseAmountToken(amountText);

  if (!foundDate && !debitAmount && !creditAmount && !singleAmount) {
    return { kind: "continuation", text: description || lineText };
  }
  if (!foundDate || (!foundDate.ambiguous && !foundDate.iso)) {
    return extractFromLine(lineText, dateOrder);
  }
  if (!debitAmount && !creditAmount && !singleAmount) {
    return extractFromLine(lineText, dateOrder);
  }

  const warnings: string[] = [];
  let chosen: ParsedAmount | null = null;
  let columnType: "debit" | "credit" | null = null;
  if (debitAmount && creditAmount) {
    chosen = debitAmount;
    columnType = "debit";
    warnings.push(BOTH_COLUMNS_WARNING);
  } else if (debitAmount) {
    chosen = debitAmount;
    columnType = "debit";
  } else if (creditAmount) {
    chosen = creditAmount;
    columnType = "credit";
  } else if (singleAmount) {
    chosen = singleAmount;
    columnType = null;
  }
  if (!chosen) return extractFromLine(lineText, dateOrder);

  const typed = amountFromMarker(chosen, columnType);
  return {
    kind: "transaction",
    dateOrder: nextDateOrder(dateOrder, foundDate),
    transaction: buildTransaction(foundDate, description, chosen.value, typed.type, typed.explicit, warnings),
  };
};

const isColumnGap = (width: number, fontSize: number): boolean => width > Math.max(fontSize * 1.25, 8);

const cellsFromPieces = (pieces: TextPiece[]): StatementCell[] => {
  const fontSize = pieces.reduce((size, piece) => Math.max(size, piece.height), 0) || 10;
  const cells: StatementCell[] = [];
  let current = "";
  let currentX = 0;
  let lastEnd = Number.NEGATIVE_INFINITY;

  const flush = (): void => {
    const text = normalizeSpace(current);
    if (text) cells.push({ x: currentX, text });
    current = "";
  };

  for (const piece of pieces) {
    if (piece.str.trim() === "") {
      if (current.trim() && isColumnGap(piece.width, fontSize)) flush();
      else if (current && !current.endsWith(" ")) current += " ";
      lastEnd = Math.max(lastEnd, piece.x + piece.width);
      continue;
    }

    const gap = piece.x - lastEnd;
    if (!current) {
      current = piece.str;
      currentX = piece.x;
    } else if (Number.isFinite(gap) && isColumnGap(gap, fontSize)) {
      flush();
      current = piece.str;
      currentX = piece.x;
    } else if (gap > fontSize * 0.2 && !current.endsWith(" ") && !piece.str.startsWith(" ")) {
      current += ` ${piece.str}`;
    } else {
      current += piece.str;
    }
    lastEnd = piece.x + piece.width;
  }

  flush();
  return cells;
};

const groupLines = (pieces: TextPiece[]): StatementLine[] => {
  const sorted = pieces.toSorted((left, right) => left.page - right.page || right.y - left.y || left.x - right.x);
  const groups: TextPiece[][] = [];

  for (const piece of sorted) {
    const group = groups[groups.length - 1];
    const anchor = group?.[0];
    if (anchor && anchor.page === piece.page && Math.abs(anchor.y - piece.y) <= Y_TOLERANCE) {
      group.push(piece);
    } else {
      groups.push([piece]);
    }
  }

  return groups.map((group) => {
    const ordered = group.toSorted((left, right) => left.x - right.x);
    return {
      page: ordered[0]?.page ?? 1,
      cells: cellsFromPieces(ordered),
    };
  });
};

export const parseStatementLines = (lines: StatementLine[], meta: StatementMeta): ParseResult | ParseError => {
  const headerIndex = lines.findIndex((line) => headerColumns(line) !== null);
  const columns = headerIndex >= 0 ? headerColumns(lines[headerIndex]) : null;
  let dateOrder: DateOrder | null = null;
  const transactions: ParsedTransaction[] = [];

  lines.forEach((line, index) => {
    if (index === headerIndex) return;
    const lineText = line.cells.map((cell) => cell.text).join(" ");
    if (isSkippableLine(lineText)) return;

    const extracted = columns ? extractWithColumns(line, columns, dateOrder) : extractFromLine(lineText, dateOrder);
    if (!extracted) return;
    if (extracted.kind === "continuation") {
      const previous = transactions[transactions.length - 1];
      if (previous && extracted.text) {
        previous.description = normalizeSpace(`${previous.description} ${extracted.text}`);
      }
      return;
    }

    dateOrder = extracted.dateOrder;
    transactions.push(extracted.transaction);
  });

  if (transactions.length === 0) {
    return {
      success: false,
      error: "No transactions found in PDF",
      retryable: false,
    };
  }

  return {
    success: true,
    transactions,
    metadata: {
      filename: meta.filename,
      fileSize: meta.fileSize,
      extractedCount: transactions.length,
      parser: "local",
    },
  };
};

const collectPieces = async (document: PdfDocumentProxy): Promise<TextPiece[]> => {
  const pieces: TextPiece[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!isTextItem(item)) continue;
      const x = Number(item.transform[4]);
      const y = Number(item.transform[5]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      pieces.push({
        str: item.str,
        x,
        y,
        width: Number(item.width) || 0,
        height: Number(item.height) || 0,
        page: pageNumber,
      });
    }
  }
  return pieces;
};

export const parsePdfLocally = async (bytes: Uint8Array, meta: StatementMeta): Promise<ParseResult | ParseError> => {
  const pdfjs = await loadPdfLibrary();
  const fontsUrl = standardFontDataUrl();
  let document: PdfDocumentProxy | null = null;

  try {
    const data = new Uint8Array(bytes);
    const task = pdfjs.getDocument({
      data,
      isEvalSupported: false,
      useWasm: false,
      disableFontFace: true,
      verbosity: pdfjs.VerbosityLevel.ERRORS,
      standardFontDataUrl: fontsUrl,
    });
    document = await task.promise;
    const pieces = await collectPieces(document);
    if (!pieces.some((piece) => piece.str.trim())) {
      return {
        success: false,
        error: "No text found in this PDF. It looks like a scan.",
        retryable: false,
      };
    }
    return parseStatementLines(groupLines(pieces), meta);
  } catch (error) {
    if (isPasswordError(error)) {
      return {
        success: false,
        error: "This PDF is password-protected. Remove the password and try again.",
        retryable: false,
      };
    }
    return {
      success: false,
      error: error instanceof Error && error.message ? error.message : "Failed to parse PDF",
      retryable: false,
    };
  } finally {
    if (document) {
      await document.destroy().catch(() => undefined);
    }
  }
};
