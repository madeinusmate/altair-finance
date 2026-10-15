import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMMANDS,
  duplicateHoldMessage,
  findCommand,
  homePointerCandidates,
  parseArgs,
  parseIncludeDuplicates,
  withIncludeDuplicates,
} from "../cli/altair.mjs";

describe("altair command", () => {
  it("parses flags without treating them as commands", () => {
    const parsed = parseArgs(["accounts", "delete", "--id", "acc_1", "--query", "unused=1"]);
    assert.deepEqual(parsed.positionals, ["accounts", "delete"]);
    assert.equal(parsed.flags.id, "acc_1");
    assert.deepEqual(parsed.flags.query, ["unused=1"]);
  });

  it("covers the books routes and leaves open banking out", () => {
    assert.ok(findCommand(["accounts", "list"]));
    assert.ok(findCommand(["books", "delete"]));
    assert.ok(findCommand(["export"]));
    assert.equal(findCommand(["open-banking", "sync"]), null);
    const names = COMMANDS.map((command) => command.words.join(" "));
    assert.equal(names.some((name) => name.includes("debug")), false);
    assert.equal(names.some((name) => name.includes("plaid")), false);
  });

  it("requires an output path for export", () => {
    const command = findCommand(["export"]);
    assert.ok(command);
    assert.deepEqual(command?.requires, ["out"]);
  });

  it("merges include-duplicates into an import body", () => {
    const parsed = parseArgs([
      "import",
      "transactions",
      "--json",
      "{}",
      "--include-duplicates",
      "0, 2",
    ]);
    assert.equal(parsed.flags.includeDuplicates, "0, 2");
    assert.deepEqual(parseIncludeDuplicates(parsed.flags.includeDuplicates), [0, 2]);
    assert.equal(parseIncludeDuplicates("all"), "all");
    assert.equal(parseIncludeDuplicates(undefined), undefined);
    assert.throws(() => parseIncludeDuplicates("first"), /--include-duplicates/);
    assert.equal(
      withIncludeDuplicates('{"rows":[]}', [0, 2]),
      JSON.stringify({ rows: [], importDuplicates: [0, 2] })
    );
    assert.equal(
      duplicateHoldMessage({
        flaggedDuplicates: [
          { index: 0, reason: "in-file", imported: false },
          { index: 1, reason: "existing", imported: true },
        ],
      }),
      "1 exact duplicate row was not imported. Re-run with --include-duplicates all or --include-duplicates 0.\n"
    );
    assert.equal(duplicateHoldMessage({ flaggedDuplicates: [] }), "");
  });

  it("looks for the agent grant in Altair and then Netly", () => {
    const pointers = homePointerCandidates("/Users/me");
    assert.deepEqual(pointers, [
      "/Users/me/Library/Application Support/Altair/home.json",
      "/Users/me/Library/Application Support/Netly/home.json",
    ]);
  });
});
