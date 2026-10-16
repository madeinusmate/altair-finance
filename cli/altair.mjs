#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GRANT_FILE_NAME = "agent-grant.json";
const PORT_FILE_NAME = "owner.json";
const TOKEN_READS = [
  ["altair", "altair.api-token"],
  ["netly", "netly.api-token"],
];

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

export const parseArgs = (argv) => {
  const positionals = [];
  const flags = {
    query: /** @type {string[]} */ ([]),
    json: /** @type {string | undefined} */ (undefined),
    jsonFile: /** @type {string | undefined} */ (undefined),
    out: /** @type {string | undefined} */ (undefined),
    id: /** @type {string | undefined} */ (undefined),
    file: /** @type {string | undefined} */ (undefined),
    accountId: /** @type {string | undefined} */ (undefined),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const take = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} needs a value`);
      }
      index += 1;
      return value;
    };
    if (arg === "--json") flags.json = take();
    else if (arg === "--json-file") flags.jsonFile = take();
    else if (arg === "--out") flags.out = take();
    else if (arg === "--id") flags.id = take();
    else if (arg === "--file") flags.file = take();
    else if (arg === "--account-id") flags.accountId = take();
    else if (arg === "--query") flags.query.push(take());
    else if (arg.startsWith("--")) throw new Error(`Unknown flag ${arg}`);
    else positionals.push(arg);
  }
  return { positionals, flags };
};

const idPath = (base) => (flags) => `${base}/${encodeURIComponent(flags.id)}`;
const idQuery = (base) => (flags) => `${base}?id=${encodeURIComponent(flags.id)}`;
const accountQuery = (base) => (flags) => `${base}?accountId=${encodeURIComponent(flags.accountId)}`;

export const COMMANDS = [
  { words: ["status"], method: "GET", path: "/api/agent/status" },
  { words: ["accounts", "list"], method: "GET", path: "/api/accounts" },
  { words: ["accounts", "get"], method: "GET", path: idPath("/api/accounts"), requires: ["id"] },
  { words: ["accounts", "create"], method: "POST", path: "/api/accounts", body: true },
  { words: ["accounts", "update"], method: "PUT", path: "/api/accounts", body: true },
  { words: ["accounts", "delete"], method: "DELETE", path: idQuery("/api/accounts"), requires: ["id"] },
  { words: ["transactions", "list"], method: "GET", path: "/api/transactions" },
  { words: ["transactions", "create"], method: "POST", path: "/api/transactions", body: true },
  { words: ["transactions", "update"], method: "PUT", path: "/api/transactions", body: true },
  { words: ["transactions", "delete"], method: "DELETE", path: idQuery("/api/transactions"), requires: ["id"] },
  { words: ["transactions-unified"], method: "GET", path: "/api/transactions-unified" },
  { words: ["transfers", "list"], method: "GET", path: "/api/transfers" },
  { words: ["transfers", "create"], method: "POST", path: "/api/transfers", body: true },
  { words: ["transfers", "update"], method: "PUT", path: "/api/transfers", body: true },
  { words: ["transfers", "delete"], method: "DELETE", path: idQuery("/api/transfers"), requires: ["id"] },
  { words: ["budgets", "list"], method: "GET", path: "/api/budgets" },
  { words: ["budgets", "create"], method: "POST", path: "/api/budgets", body: true },
  { words: ["budgets", "delete"], method: "DELETE", path: idPath("/api/budgets"), requires: ["id"] },
  { words: ["budgets", "spending"], method: "GET", path: "/api/budgets/spending" },
  { words: ["categories", "accounts", "list"], method: "GET", path: "/api/account-categories" },
  { words: ["categories", "accounts", "create"], method: "POST", path: "/api/account-categories", body: true },
  { words: ["categories", "accounts", "update"], method: "PUT", path: "/api/account-categories", body: true },
  { words: ["categories", "accounts", "delete"], method: "DELETE", path: idQuery("/api/account-categories"), requires: ["id"] },
  { words: ["categories", "transactions", "list"], method: "GET", path: "/api/transaction-categories" },
  { words: ["categories", "transactions", "create"], method: "POST", path: "/api/transaction-categories", body: true },
  { words: ["categories", "transactions", "update"], method: "PUT", path: "/api/transaction-categories", body: true },
  { words: ["categories", "transactions", "delete"], method: "DELETE", path: idQuery("/api/transaction-categories"), requires: ["id"] },
  { words: ["imports", "list"], method: "GET", path: "/api/imports" },
  { words: ["imports", "get"], method: "GET", path: idPath("/api/imports"), requires: ["id"] },
  { words: ["imports", "delete"], method: "DELETE", path: idPath("/api/imports"), requires: ["id"] },
  { words: ["import", "transactions"], method: "POST", path: "/api/import/transactions", body: true },
  { words: ["import", "balances"], method: "POST", path: "/api/import/balances", body: true },
  { words: ["import", "accounts"], method: "POST", path: "/api/import/accounts", body: true },
  { words: ["import", "pdf"], method: "POST", path: "/api/import/pdf-statements/parse", multipart: true, requires: ["file", "accountId"] },
  { words: ["dashboard", "spending"], method: "GET", path: "/api/dashboard/spending" },
  { words: ["dashboard", "cash-flow"], method: "GET", path: "/api/dashboard/cash-flow" },
  { words: ["dashboard", "monthly"], method: "GET", path: "/api/dashboard/monthly-income-expenses" },
  { words: ["dashboard", "budget"], method: "GET", path: "/api/dashboard/budget" },
  { words: ["dashboard", "investment"], method: "GET", path: "/api/dashboard/investment-performance" },
  { words: ["dashboard", "sankey"], method: "GET", path: "/api/dashboard/cash-flow-sankey" },
  { words: ["net-worth"], method: "GET", path: "/api/net-worth" },
  { words: ["balance-history", "list"], method: "GET", path: accountQuery("/api/balance-history"), requires: ["accountId"] },
  { words: ["balance-history", "create"], method: "POST", path: "/api/balance-history", body: true },
  { words: ["balance-history", "update"], method: "PUT", path: "/api/balance-history", body: true },
  { words: ["balance-history", "delete"], method: "DELETE", path: idQuery("/api/balance-history"), requires: ["id"] },
  { words: ["investment-history", "list"], method: "GET", path: accountQuery("/api/investment-history"), requires: ["accountId"] },
  { words: ["investment-history", "create"], method: "POST", path: "/api/investment-history", body: true },
  { words: ["investment-history", "update"], method: "PUT", path: "/api/investment-history", body: true },
  { words: ["investment-history", "delete"], method: "DELETE", path: idQuery("/api/investment-history"), requires: ["id"] },
  { words: ["export"], method: "POST", path: "/api/app/export", binary: true, requires: ["out"] },
  { words: ["books", "delete"], method: "DELETE", path: "/api/app/delete", body: true },
];

export const findCommand = (positionals) => {
  return COMMANDS.find((command) => command.words.join(" ") === positionals.join(" ")) ?? null;
};

const fail = (error) => {
  process.stdout.write(`${JSON.stringify({ error })}\n`);
  process.exit(1);
};

export const homePointerCandidates = (home = os.homedir()) => [
  path.join(home, "Library", "Application Support", "Altair", "home.json"),
  path.join(home, "Library", "Application Support", "Netly", "home.json"),
];

const readHomeFile = () => {
  for (const candidate of homePointerCandidates()) {
    try {
      return JSON.parse(fs.readFileSync(candidate, "utf8"));
    } catch {
      // The grant pointer may still be in the Netly support directory.
    }
  }
  return null;
};

const readKeychain = (helper, account, service) => {
  return new Promise((resolve, reject) => {
    const child = spawn(helper, ["read", account, service], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error("Keychain read failed"));
      else resolve(stdout);
    });
  });
};

const withQuery = (pathname, query) => {
  if (query.length === 0) return pathname;
  const params = new URLSearchParams();
  for (const pair of query) {
    const splitAt = pair.indexOf("=");
    if (splitAt === -1) throw new Error(`Query ${pair} must be key=value`);
    params.append(pair.slice(0, splitAt), pair.slice(splitAt + 1));
  }
  const joiner = pathname.includes("?") ? "&" : "?";
  return `${pathname}${joiner}${params.toString()}`;
};

const main = async () => {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Could not read arguments");
    return;
  }

  if (parsed.positionals.length === 0 || parsed.positionals[0] === "help") {
    const lines = COMMANDS.map((command) => command.words.join(" "));
    process.stderr.write(`altair commands:\n${lines.map((line) => `  ${line}`).join("\n")}\n`);
    process.exit(parsed.positionals[0] === "help" ? 0 : 1);
    return;
  }

  const command = findCommand(parsed.positionals);
  if (!command) fail(`Unknown command: ${parsed.positionals.join(" ")}`);

  for (const name of command.requires ?? []) {
    if (!parsed.flags[name]) fail(`${command.words.join(" ")} needs --${name === "accountId" ? "account-id" : name}`);
  }

  const home = readHomeFile();
  if (!home) {
    fail("Altair agent grant is not set up");
    return;
  }

  let grant;
  try {
    grant = JSON.parse(fs.readFileSync(path.join(home.userData, GRANT_FILE_NAME), "utf8"));
  } catch {
    fail("Altair agent grant is not set up");
    return;
  }
  if (!grant.enabled) fail("Altair agent grant is not set up");
  if (grant.stopped) fail("Agent grant is stopped");

  let portRecord;
  try {
    portRecord = JSON.parse(fs.readFileSync(path.join(home.userData, PORT_FILE_NAME), "utf8"));
  } catch {
    fail("Books owner is not running");
    return;
  }

  let token = "";
  for (const [account, service] of TOKEN_READS) {
    try {
      token = (await readKeychain(home.keychainHelper, account, service)).trim();
      if (token) break;
    } catch {
      token = "";
    }
  }
  if (!token) {
    fail("Could not read the agent grant");
    return;
  }

  const pathname = typeof command.path === "function" ? command.path(parsed.flags) : command.path;
  const url = `http://127.0.0.1:${portRecord.port}${withQuery(pathname, parsed.flags.query)}`;
  const headers = { "x-altair-token": token };
  let body;

  if (command.multipart) {
    const bytes = fs.readFileSync(parsed.flags.file);
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "application/pdf" }), path.basename(parsed.flags.file));
    form.append("accountId", parsed.flags.accountId);
    body = form;
  } else if (command.body) {
    if (command.words[0] === "books") body = "{}";
    else if (parsed.flags.jsonFile) body = fs.readFileSync(parsed.flags.jsonFile, "utf8");
    else if (parsed.flags.json) body = parsed.flags.json;
    else fail(`${command.words.join(" ")} needs --json or --json-file`);
    headers["content-type"] = "application/json";
  }

  const response = await fetch(url, {
    method: command.method,
    headers,
    body,
    signal: AbortSignal.timeout(130000),
  });

  if (command.binary) {
    if (!response.ok) {
      const text = await response.text();
      process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
      process.exit(1);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(parsed.flags.out, bytes);
    process.stdout.write(`${JSON.stringify({ ok: true, path: parsed.flags.out })}\n`);
    return;
  }

  const text = await response.text();
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  if (!response.ok) process.exit(1);
};

if (isDirectRun) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : "Command failed");
  });
}
