import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMMANDS, findCommand, homePointerCandidates, parseArgs } from "../cli/altair.mjs";

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

  it("looks for the agent grant in Altair and then Netly", () => {
    const pointers = homePointerCandidates("/Users/me");
    assert.deepEqual(pointers, [
      "/Users/me/Library/Application Support/Altair/home.json",
      "/Users/me/Library/Application Support/Netly/home.json",
    ]);
  });
});
