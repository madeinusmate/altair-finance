import assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import { NextRequest } from "next/server";
import * as schema from "../lib/db/schema";
import type { ParseResult } from "../lib/pdf/types";

const localCalls: unknown[][] = [];

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

  it("uses the local parser", async () => {
    localCalls.length = 0;
    const response = await POST(requestFor());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(localCalls.length, 1);
    assert.equal(body.metadata.parser, "local");
  });

  it("ignores a parser field and still uses the local parser", async () => {
    localCalls.length = 0;
    const response = await POST(requestFor("openai"));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(localCalls.length, 1);
    assert.equal(body.metadata.parser, "local");
  });
});
