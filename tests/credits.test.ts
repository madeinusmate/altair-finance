import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { author, isGitHubCreditUrl, libraryGroups, license, repository } from "../lib/credits";

describe("credits", () => {
  it("attributes the app to madeinusmate and the netly repository", () => {
    assert.equal(author.name, "@madeinusmate");
    assert.equal(author.url, "https://github.com/madeinusmate");
    assert.equal(repository.url, "https://github.com/madeinusmate/netly");
    assert.equal(license.name, "MIT");
  });

  it("points every credit link at a github.com https url", () => {
    const urls = [
      author.url,
      repository.url,
      license.url,
      ...libraryGroups.flatMap((group) => group.libraries.map((library) => library.url)),
    ];

    assert.ok(urls.length > 3);
    for (const url of urls) {
      assert.equal(isGitHubCreditUrl(url), true, url);
    }
  });

  it("rejects urls the desktop window must not open", () => {
    assert.equal(isGitHubCreditUrl("http://github.com/madeinusmate/netly"), false);
    assert.equal(isGitHubCreditUrl("https://github.com.evil/netly"), false);
    assert.equal(isGitHubCreditUrl("https://user:pass@github.com/madeinusmate/netly"), false);
    assert.equal(isGitHubCreditUrl("https://example.com"), false);
    assert.equal(isGitHubCreditUrl("not a url"), false);
  });
});
