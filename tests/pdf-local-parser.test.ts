import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePdfLocally, parseStatementLines, type StatementLine } from "../lib/pdf/local-parser";

const pdfEscape = (value: string): string => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const buildTextPdf = (lines: Array<{ y: number; cells: Array<{ x: number; text: string }> }>): Uint8Array => {
  const commands = lines.map((line) => {
    const parts = ["BT", "/F1 10 Tf"];
    line.cells.forEach((cell, index) => {
      if (index === 0) {
        parts.push(`${cell.x} ${line.y} Td`);
      } else {
        const previous = line.cells[index - 1];
        parts.push(`${cell.x - previous.x} 0 Td`);
      }
      parts.push(`(${pdfEscape(cell.text)}) Tj`);
    });
    parts.push("ET");
    return parts.join("\n");
  });
  const contentStream = commands.join("\n");
  const header = "%PDF-1.4\n";
  const bodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(contentStream)} >>\nstream\n${contentStream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let output = header;
  const offsets = [0];
  for (let index = 0; index < bodies.length; index += 1) {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${bodies[index]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(output);
  let xref = `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= bodies.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  output += `${xref}trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(output));
};

const meta = { filename: "statement.pdf", fileSize: 128 };

describe("local PDF statement parser", () => {
  it("reads a text statement on device and skips the closing balance", async () => {
    const bytes = buildTextPdf([
      {
        y: 720,
        cells: [
          { x: 50, text: "Date" },
          { x: 170, text: "Description" },
          { x: 350, text: "Amount" },
        ],
      },
      {
        y: 700,
        cells: [
          { x: 50, text: "2024-01-15" },
          { x: 170, text: "Coffee Shop" },
          { x: 350, text: "12.50" },
        ],
      },
      {
        y: 680,
        cells: [
          { x: 50, text: "2024-01-16" },
          { x: 170, text: "Refund" },
          { x: 350, text: "(4.00)" },
        ],
      },
      {
        y: 660,
        cells: [
          { x: 50, text: "Closing balance" },
          { x: 350, text: "100.00" },
        ],
      },
    ]);

    const result = await parsePdfLocally(bytes, { filename: "january.pdf", fileSize: bytes.byteLength });
    assert.equal(result.success, true);
    if (!result.success) return;

    assert.equal(result.metadata.parser, "local");
    assert.equal(result.metadata.filename, "january.pdf");
    assert.equal(result.metadata.fileSize, bytes.byteLength);
    assert.equal(result.metadata.extractedCount, 2);
    assert.equal(result.transactions.length, 2);
    assert.deepEqual(
      result.transactions.map((transaction) => ({
        date: transaction.date,
        description: transaction.description,
        amount: transaction.amount,
        category: transaction.category,
        type: transaction.type,
      })),
      [
        {
          date: "2024-01-15",
          description: "Coffee Shop",
          amount: 12.5,
          category: "",
          type: "debit",
        },
        {
          date: "2024-01-16",
          description: "Refund",
          amount: 4,
          category: "",
          type: "credit",
        },
      ]
    );
    assert.equal(result.transactions.some((transaction) => /closing balance/i.test(transaction.description)), false);
    assert.ok(result.transactions[0]?.warnings?.includes("Type assumed debit"));
    assert.equal(Boolean(result.transactions[1]?.warnings?.includes("Type assumed debit")), false);
  });

  it("keeps ambiguous numeric dates and warns instead of guessing", async () => {
    const bytes = buildTextPdf([
      {
        y: 700,
        cells: [
          { x: 50, text: "01/02/2024" },
          { x: 180, text: "Grocery" },
          { x: 360, text: "10.00" },
        ],
      },
      {
        y: 680,
        cells: [
          { x: 50, text: "03/04/2024" },
          { x: 180, text: "Taxi" },
          { x: 360, text: "20.00" },
        ],
      },
    ]);

    const result = await parsePdfLocally(bytes, meta);
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.transactions.length, 2);
    for (const transaction of result.transactions) {
      assert.ok(transaction.warnings?.includes("Ambiguous date; confirm YYYY-MM-DD"));
    }
    assert.match(result.transactions[0]?.description ?? "", /01\/02\/2024/);
    assert.match(result.transactions[1]?.description ?? "", /03\/04\/2024/);
  });

  it("stops on a PDF with no text layer", async () => {
    const bytes = buildTextPdf([]);
    const result = await parsePdfLocally(bytes, meta);
    assert.equal(result.success, false);
    if (result.success) return;
    assert.match(result.error, /scan/i);
    assert.equal(result.retryable, false);
  });

  it("uses one numeric order for later rows after an unambiguous date", () => {
    const lines: StatementLine[] = [
      { page: 1, cells: [{ x: 40, text: "01/02/2024 Alpha 10.00" }] },
      { page: 1, cells: [{ x: 40, text: "15/01/2024 Beta 20.00" }] },
      { page: 1, cells: [{ x: 40, text: "02/03/2024 Gamma 30.00" }] },
    ];
    const result = parseStatementLines(lines, meta);
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.transactions[0]?.date, "01/02/2024");
    assert.ok(result.transactions[0]?.warnings?.includes("Ambiguous date; confirm YYYY-MM-DD"));
    assert.equal(result.transactions[1]?.date, "2024-01-15");
    assert.equal(result.transactions[2]?.date, "2024-03-02");
    assert.equal(result.transactions[2]?.warnings?.includes("Ambiguous date; confirm YYYY-MM-DD"), false);
  });

  it("uses debit and credit columns without assuming a type", () => {
    const lines: StatementLine[] = [
      {
        page: 1,
        cells: [
          { x: 40, text: "Date" },
          { x: 140, text: "Description" },
          { x: 280, text: "Debit" },
          { x: 400, text: "Credit" },
        ],
      },
      {
        page: 1,
        cells: [
          { x: 40, text: "2024-02-01" },
          { x: 140, text: "Rent" },
          { x: 280, text: "1,200.00" },
        ],
      },
      {
        page: 1,
        cells: [
          { x: 40, text: "2024-02-02" },
          { x: 140, text: "Pay" },
          { x: 400, text: "3,000.00" },
        ],
      },
    ];
    const result = parseStatementLines(lines, meta);
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.transactions[0]?.type, "debit");
    assert.equal(result.transactions[0]?.amount, 1200);
    assert.equal(result.transactions[0]?.warnings, undefined);
    assert.equal(result.transactions[1]?.type, "credit");
    assert.equal(result.transactions[1]?.amount, 3000);
    assert.equal(result.transactions[1]?.category, "");
  });

  it("treats CR, parentheses, and a leading minus as credit", () => {
    const lines: StatementLine[] = [
      { page: 1, cells: [{ x: 40, text: "2024-05-01 Shop 12.50 CR" }] },
      { page: 1, cells: [{ x: 40, text: "2024-05-02 Store 9.00 DR" }] },
      { page: 1, cells: [{ x: 40, text: "2024-05-03 Refund -4.25" }] },
    ];
    const result = parseStatementLines(lines, meta);
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.transactions[0]?.type, "credit");
    assert.equal(result.transactions[0]?.amount, 12.5);
    assert.equal(result.transactions[1]?.type, "debit");
    assert.equal(result.transactions[1]?.warnings, undefined);
    assert.equal(result.transactions[2]?.type, "credit");
    assert.equal(result.transactions[2]?.amount, 4.25);
  });

  it("appends a following line that has no date or amount", () => {
    const lines: StatementLine[] = [
      {
        page: 1,
        cells: [
          { x: 40, text: "Date" },
          { x: 160, text: "Description" },
          { x: 320, text: "Amount" },
        ],
      },
      {
        page: 1,
        cells: [
          { x: 40, text: "2024-03-01" },
          { x: 160, text: "Market" },
          { x: 320, text: "8.00" },
        ],
      },
      { page: 1, cells: [{ x: 160, text: "Seattle WA" }] },
    ];
    const result = parseStatementLines(lines, meta);
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.transactions.length, 1);
    assert.equal(result.transactions[0]?.description, "Market Seattle WA");
  });
});
