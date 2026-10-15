import assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import { NextRequest } from "next/server";
import * as schema from "../lib/db/schema";
import type { ParseResult } from "../lib/pdf/types";

const openaiCalls: unknown[][] = [];
const localCalls: unknown[][] = [];
const categoryCalls: unknown[][] = [];

const localResult = (): ParseResult => ({
  success: true,
  transactions: [
    {
      date: "2024-01-15",
      description: "Coffee",
      amount: 12.5,
      category: "",
      type: "debit",
    },
  ],
  metadata: {
    filename: "statement.pdf",
    fileSize: 8,
    extractedCount: 1,
    parser: "local",
  },
});

const openAiResult = (): ParseResult => ({
  success: true,
  transactions: [
    {
      date: "2024-01-16",
      description: "Cloud",
      amount: 8,
      category: "Other Expenses",
      type: "credit",
    },
  ],
  metadata: {
    filename: "statement.pdf",
    fileSize: 8,
    extractedCount: 1,
    parser: "openai",
  },
});

mock.module("@/lib/pdf/openai-client", {
  namedExports: {
    parsePdfStatement: async (...args: unknown[]) => {
      openaiCalls.push(args);
      return openAiResult();
    },
  },
});

mock.module("@/lib/pdf/local-parser", {
  namedExports: {
    parsePdfLocally: async (...args: unknown[]) => {
      localCalls.push(args);
      return localResult();
    },
  },
});

mock.module("@/lib/api-utils", {
  namedExports: {
    getEncryptionKey: () => "test-key-12345678",
  },
});

mock.module("@/lib/db", {
  namedExports: {
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            get: () => ({ id: "acc-pdf-route", type: "transaction" }),
          }),
        }),
      }),
    }),
    schema,
  },
});

mock.module("@/lib/db/category-helpers", {
  namedExports: {
    getTransactionCategoryNames: (...args: unknown[]) => {
      categoryCalls.push(args);
      return ["Other Expenses"];
    },
  },
});

const resetCalls = (): void => {
  openaiCalls.length = 0;
  localCalls.length = 0;
  categoryCalls.length = 0;
};

const requestFor = (parser?: string): NextRequest => {
  const form = new FormData();
  form.set(
    "file",
    new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "statement.pdf", { type: "application/pdf" })
  );
  form.set("accountId", "acc-pdf-route");
  if (parser !== undefined) form.set("parser", parser);
  return new NextRequest("http://127.0.0.1/api/import/pdf-statements/parse", {
    method: "POST",
    headers: { "X-Encryption-Key": "test-key-12345678" },
    body: form,
  });
};

describe("pdf parse route", () => {
  let POST: (request: NextRequest) => Promise<Response>;

  before(async () => {
    const route = await import("../app/api/import/pdf-statements/parse/route");
    POST = route.POST;
  });

  it("uses the local parser when parser is omitted and does not call OpenAI", async () => {
    resetCalls();
    const response = await POST(requestFor());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(localCalls.length, 1);
    assert.equal(openaiCalls.length, 0);
    assert.equal(categoryCalls.length, 0);
    assert.equal(body.metadata.parser, "local");
  });

  it("calls OpenAI only for parser=openai and does not call the local parser", async () => {
    resetCalls();
    const response = await POST(requestFor("openai"));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(openaiCalls.length, 1);
    assert.equal(localCalls.length, 0);
    assert.deepEqual(openaiCalls[0]?.[2], ["Other Expenses"]);
    assert.equal(body.metadata.parser, "openai");
  });

  it("treats an unknown parser value as local", async () => {
    resetCalls();
    const response = await POST(requestFor("cloud"));
    assert.equal(response.status, 200);
    assert.equal(localCalls.length, 1);
    assert.equal(openaiCalls.length, 0);
    assert.equal(categoryCalls.length, 0);
  });
});
