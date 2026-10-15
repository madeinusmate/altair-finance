# Parse statements on device

## Goal

A person can drop a bank or credit-card PDF onto an account and get rows in the review table without the file leaving the machine. Parsing uses the PDF text layer plus heuristics. The same review table and `POST /api/import/transactions` path already used today stay in place. Sending the PDF to OpenAI is a separate choice, off every time the screen opens, with copy that says the file will leave the device. Netly does not ship an API key.

## Current behavior

PDF import is mounted in two places: the account dialog in `app/(app)/accounts/[id]/page.tsx` (`PdfStatementImport` with a fixed `accountId`) and the CSV wizard's PDF section in `app/(app)/settings/import/page.tsx`. Both render `components/pdf-import/pdf-statement-import.tsx`.

Choosing a file calls `handleFileSelected`, which POSTs the raw file to `/api/import/pdf-statements/parse` with the `X-Encryption-Key` header. The route is `app/api/import/pdf-statements/parse/route.ts`. It checks the encryption key, requires `accountId`, checks the account exists and `accounts.type === "transaction"`, base64-encodes the entire PDF, loads category names with `getTransactionCategoryNames`, and calls `parsePdfStatement`.

`lib/pdf/openai-client.ts` `parsePdfStatement` reads `process.env.OPENAI_API_KEY` and calls `openai.responses.create` with model `gpt-5-nano`. The user message includes the full prompt plus `input_file` whose `file_data` is `data:application/pdf;base64,${pdfBase64}`. The whole statement goes to OpenAI. There is no local branch. If `OPENAI_API_KEY` is missing the route returns `"OpenAI API key not configured"` and the UI shows that as a hard failure. Retries (up to 3, with backoff on HTTP 429) send the file again. `.env.example` lists `OPENAI_API_KEY` as optional and says it is used for PDF statement import. Nothing in the repo commits a key. `electron/main.ts` spawns Next with `...process.env`, so a key present in the desktop process environment is visible to this route.

The upload UI does not say this. `components/pdf-import/pdf-upload.tsx` only says "Upload a PDF bank or credit card statement (max 50MB)". The account dialog description in `app/(app)/accounts/[id]/page.tsx` is the same idea. `validatePdfFile` (50MB, `application/pdf`) lives in the OpenAI module, and the upload component imports it from there.

`pdfjs-dist` `5.4.530` is a dependency in `package.json` and is not imported anywhere. The legacy build is at `node_modules/pdfjs-dist/legacy/build/pdf.mjs` and exports `getDocument`. `canvas` is already a dependency; PDF.js's Node canvas factory can load it. Do not add another PDF library.

After a successful parse, `pdf-statement-import.tsx` maps each `ParsedTransaction` into a CSV-shaped row and runs `validateTransactionRows` from `lib/csv/import-validators.ts`. An empty or unknown `category` becomes `Other Expenses` (or `Other` if that name exists) and a warning is attached. The user edits rows in `components/pdf-import/pdf-review-table.tsx`, which imports the `ParsedTransaction` type from `lib/pdf/openai-client.ts`. Import posts the kept rows to `POST /api/import/transactions`. That insert path is unchanged by this plan except that it must keep accepting the same row shape.

`scripts/extract-statements.ts` (`pnpm extract-statements`) is a developer script, not a route. It reads PDFs from the gitignored `statements/` folder and sends them to OpenAI (`gpt-5`) itself. The app must not call it.

## Proposed design

Add a local parser and make it the only parser the route runs unless the form field `parser` is the exact string `openai`.

### Shared import pipeline

CSV and PDF meet at the review table, then at `POST /api/import/transactions`. Keep this order so this plan, duplicate blocking, and categorization do not fight:

1. Parse. CSV stays in `lib/csv/parse.ts` on the client. PDF is parsed on the machine by this plan. OpenAI runs only when this request opted in.
2. Categorize. After `validateTransactionRows`, the categorization plan fills a missing category from local rules. This plan does not guess a category. A blank category is what that step expects from the local parser.
3. Duplicates. The duplicate plan marks rows and drops them from the payload unless the user includes that row. This plan still returns one row per extracted transaction and still posts through the existing import route.
4. Insert. The server stores the category on the row. It does not re-parse the PDF and it does not replace the category.

### Local parser

New module `lib/pdf/local-parser.ts`. Call it only from the parse route (server). Do not import `pdfjs-dist` into client components.

Use `pdfjs-dist/legacy/build/pdf.mjs` `getDocument` with the bytes as `data` (a `Uint8Array`, not a URL). Set `isEvalSupported: false`, `useWasm: false`, and `disableFontFace: true`. Point `GlobalWorkerOptions.workerSrc` at a `file://` URL for `pdfjs-dist/legacy/build/pdf.worker.mjs` inside this install. Do not load a worker from a CDN or any other host. Read text with `page.getTextContent()`. Do not call `page.render()`.

Group text items into lines. Each item has a transform; use x and y. Round y to a tolerance of about 2 units so items on the same baseline share a line. Sort by page, then y descending, then x. Join items on a line with a single space when the gap is small, and keep a wider gap as a column break.

Find a header line by looking for date words (`date`, `posted`, `trans date`) together with amount words (`amount`, `debit`, `credit`, `withdrawal`, `deposit`, `charge`). Remember which column is the date and which columns are debit, credit, or a single signed amount. If no header exists, still scan every line for a date plus an amount.

Date formats to accept, written back as `YYYY-MM-DD`:

- `YYYY-MM-DD`
- `DD MMM YYYY` and `MMM DD, YYYY`
- `DD/MM/YYYY` and `DD-MM-YYYY` when the first number is greater than 12
- `MM/DD/YYYY` when the second number is greater than 12

When both day and month are 12 or less, do not flip the date silently. Keep the row, put the raw text in `description` if needed, and add a warning `Ambiguous date; confirm YYYY-MM-DD`. Prefer one consistent format for the rest of that file once an unambiguous row has settled it.

Amounts stay positive numbers, matching `ParsedTransaction`. Strip currency symbols and thousands separators. Parentheses or a trailing `CR` set `type` to `credit`. A trailing `DR` sets `debit`. Two columns mapped as debit and credit use whichever one is non-empty. A leading minus on a single amount column sets `credit`. Anything else sets `debit` and adds a warning `Type assumed debit`. This matches the current OpenAI prompt, which treats bracketed amounts as credits.

Description is the line text that is not the date or the amount. A following line with no date and no amount is appended to the previous description. Skip lines that are only running balances, page numbers, or statement-period headers (`opening balance`, `closing balance`, `page 1 of`, `statement period`).

Set `category` to `""`. Do not invent one. `validateTransactionRows` will default that to `Other Expenses` until categorization rules run.

Return the same success shape `parsePdfStatement` returns today (`success`, `transactions[]` of `{ date, description, amount, category, type }`, `metadata.filename`, `metadata.fileSize`, `metadata.extractedCount`) so `pdf-statement-import.tsx` can stay a thin mapper. Add `metadata.parser: "local" | "openai"`.

Password-protected files: surface `This PDF is password-protected. Remove the password and try again.` Do not fall through to OpenAI. Image-only scans with no text items: return `No text found in this PDF. It looks like a scan.` and stop. The opt-in control is how a scan gets another try. Never switch parsers inside the route.

Move the shared `ParsedTransaction` / `ParseResult` types to `lib/pdf/types.ts`. `openai-client.ts`, `local-parser.ts`, and `pdf-review-table.tsx` import types from there. Move `validatePdfFile` next to those types (or into `lib/pdf/validate.ts`) so the upload component does not import the OpenAI client.

### Opt-in cloud parse

`PdfUpload` gains a checkbox that is unchecked on every mount. Do not write the choice to `localStorage` or `user_settings`.

Copy, always visible under the file field:

> Statements are read on this computer. The file is not sent anywhere unless you turn on cloud parsing.

Checkbox label:

> Send this PDF to OpenAI for parsing. The file leaves this device. Netly does not include an API key. Cloud parsing works only if you set OPENAI_API_KEY yourself.

The account dialog description in `app/(app)/accounts/[id]/page.tsx` should use the same first sentence so the closed dialog does not imply a private upload that is actually remote.

`handleFileSelected` appends `parser=local` by default, or `parser=openai` only when the checkbox is checked. The route treats a missing or unknown `parser` as `local`. It calls `parsePdfStatement` only when `parser === "openai"`. A missing key remains a non-retryable error on that path only. Local failure must not trigger a second request.

Update `.env.example` so `OPENAI_API_KEY` is described as the opt-in cloud parser, off unless the user checks the box. Do not put a key in the example file.

### Later, not this plan

A local model such as Ollama at `http://127.0.0.1:11434` can be a third parser later. It would send extracted text, not the PDF, and only to loopback, after its own checkbox. Do not implement it here and do not call any other host.

## Work breakdown

1. Add `lib/pdf/types.ts` and move `ParsedTransaction`, `ParseResult`, `ParseError`, and `validatePdfFile` there. Update imports in `lib/pdf/openai-client.ts`, `components/pdf-import/pdf-upload.tsx`, `components/pdf-import/pdf-statement-import.tsx`, and `components/pdf-import/pdf-review-table.tsx`.
2. Add `lib/pdf/local-parser.ts` with the line grouping, header detection, date/amount/type heuristics, and the `getDocument` call described above.
3. Change `app/api/import/pdf-statements/parse/route.ts` to branch on the `parser` form field. Default `local`. Pass category names into the OpenAI function only on the opt-in branch. Return `metadata.parser`.
4. Change `components/pdf-import/pdf-upload.tsx` and the account dialog description. Thread the checkbox into `handleFileSelected` in `components/pdf-import/pdf-statement-import.tsx`.
5. Leave `validateTransactionRows` and the review table behavior alone, except the type import. Blank `category` must still flow into the existing default.
6. Rewrite the PDF paragraph in `.env.example`. Add a one-line comment at the top of `scripts/extract-statements.ts` that the script uploads statement files to OpenAI and is not used by the app.
7. Add `tests/pdf-local-parser.test.ts`. Build a tiny text PDF in the test (or check in a synthetic fixture under `tests/fixtures/`). Do not read `statements/`.

## Data migration

None. Parsing does not write tables. `SCHEMA_VERSION` stays `1`. Inserts still go through `POST /api/import/transactions`.

## Privacy

The default path reads the PDF in the Next process on `127.0.0.1` and writes nothing off the machine. The worker script is a local file. No CDN.

The only new network call is the existing OpenAI request, and only when that upload's checkbox is checked and `OPENAI_API_KEY` is set in the environment. The bytes sent are the full PDF, as today. There is no bundled key. FX rates (`lib/fx.ts` calling `https://open.er-api.com`) are unrelated and stay as they are.

`scripts/extract-statements.ts` still uploads if someone runs it by hand.

## Risks and edge cases

- Statement layouts differ. A parser that misses a column should return fewer rows plus warnings, not a silent wrong import. The review table is the backstop.
- Ambiguous `DD/MM` versus `MM/DD` will mis-file a transaction if guessed. Warn instead.
- Multi-line descriptions and running-balance lines will sometimes stick to the wrong row. The description field is editable.
- Scanned PDFs have no text layer. The local parser stops. Cloud parse is opt-in and still imperfect.
- Password PDFs must not be forwarded to OpenAI on their own.
- `pdfjs-dist` 5 always constructs a `PDFWorker` unless one is passed. If the worker fails under Electron's Node, fix the worker path. Do not replace the library.
- Node canvas factory imports `canvas` when a page is rendered. Text extraction should not render. If load-time still requires `canvas`, it is already installed.
- Very large text PDFs (up to the existing 50MB cap) are CPU work on the local server. That is acceptable. Do not stream the file out to keep the server responsive.
- The OpenAI client drops rows with an invalid category. The local parser does not, because categorization and the review table handle that. Do not copy the drop behavior into the local parser.

## Test plan

- `tests/pdf-local-parser.test.ts`: a one-page text statement with a header, a debit, a parenthesized credit, and a closing-balance line. Expect two transactions, the balance line omitted, credit type on the parenthesized amount, category `""`, dates `YYYY-MM-DD`.
- Ambiguous `01/02/2024` and `03/04/2024` with no header: both rows returned, each with the ambiguous-date warning, no thrown error.
- Empty text layer: error mentioning a scan, `retryable: false`.
- Route unit or handler test: omitted `parser` does not construct an OpenAI client (mock the module and assert it was not called). `parser=openai` calls it and does not call the local parser.
- Existing `tests/import-upload-path.test.ts` stays green; it covers backup zip names, not PDFs.
- Manual: import a text PDF with the checkbox off and confirm no request to `api.openai.com` (the parse route returns `metadata.parser: "local"`). Check the box with no key and confirm the key error. Check the box with a key only if you are willing to upload that file.
- After import, the review table still edits date, description, amount, category, and type, and still posts to `/api/import/transactions`.

## Out of scope

- Categorization rules and duplicate enforcement (their own plans). The local parser must not block those hooks.
- Ollama or any other local LLM.
- OCR for scans.
- Changing `scripts/extract-statements.ts` beyond the warning comment.
- Rewriting the CSV parser.

## Rough size

L. The route flag and the disclosure are small. Reliable extraction across real statement layouts is the bulk of the work, and it needs fixture tests plus time in the review table with ugly PDFs.
