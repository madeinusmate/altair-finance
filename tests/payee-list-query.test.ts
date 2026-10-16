import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeLike, parsePayeeListQuery, payeeLikePattern } from "../lib/payees/list-query";

describe("payee list query", () => {
  it("leaves an unpaged request unlimited", () => {
    const parsed = parsePayeeListQuery(new URLSearchParams());
    assert.deepEqual(parsed, { limit: null, offset: 0, q: "", summary: false });
  });

  it("accepts a page and a summary view", () => {
    const parsed = parsePayeeListQuery(new URLSearchParams("limit=40&offset=80&q=grab&view=summary"));
    assert.deepEqual(parsed, { limit: 40, offset: 80, q: "grab", summary: true });
  });

  it("rejects a limit outside 1 to 100", () => {
    assert.equal("error" in parsePayeeListQuery(new URLSearchParams("limit=0")), true);
    assert.equal("error" in parsePayeeListQuery(new URLSearchParams("limit=101")), true);
    assert.equal("error" in parsePayeeListQuery(new URLSearchParams("limit=nope")), true);
    assert.equal("error" in parsePayeeListQuery(new URLSearchParams("offset=-1")), true);
  });

  it("escapes LIKE wildcards", () => {
    assert.equal(escapeLike("100%_\\"), "100\\%\\_\\\\");
    assert.equal(payeeLikePattern("  A% "), "%a\\%%");
    assert.equal(payeeLikePattern("   "), null);
  });
});
