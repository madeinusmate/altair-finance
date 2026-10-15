import { parsePdfLocally } from "./local-parser";
import { parsePdfStatement } from "./openai-client";
import type { ParseError, ParseResult, StatementParser } from "./types";

export const pdfParsers = {
  local: parsePdfLocally,
  openai: parsePdfStatement,
};

export const resolveStatementParser = (parserField: string | null): StatementParser =>
  parserField === "openai" ? "openai" : "local";

const withParser = (
  result: ParseResult | ParseError,
  parser: StatementParser
): ParseResult | ParseError => {
  if (!result.success) return result;
  return {
    ...result,
    metadata: {
      ...result.metadata,
      parser,
    },
  };
};

export const runStatementParser = async (
  parserField: string | null,
  bytes: Uint8Array,
  filename: string,
  validCategories: string[]
): Promise<ParseResult | ParseError> => {
  const parser = resolveStatementParser(parserField);

  if (parser === "openai") {
    const pdfBase64 = Buffer.from(bytes).toString("base64");
    const result = await pdfParsers.openai(pdfBase64, filename, validCategories);
    return withParser(result, "openai");
  }

  const result = await pdfParsers.local(bytes, {
    filename,
    fileSize: bytes.byteLength,
  });
  return withParser(result, "local");
};
