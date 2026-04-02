import assert from "node:assert/strict";
import { test } from "./harness.js";
import { extractChallengeCode, renderVotingIndexSection } from "../src/renderers/voting-index.js";

test("extractChallengeCode finds the first === header === and adds link=-", () => {
  const wikiText = [
    "{{Commons:Photo challenge/2026 - March - Three-wheelers}}",
    "",
    "=== {{ucfirst:{{ISOdate|2026-03|{{PAGELANGUAGE}}|capitalization=ucfirst}}}} ===",
    "",
    "Some description text."
  ].join("\n");

  const code = extractChallengeCode(wikiText);
  assert.equal(code, "{{ucfirst:{{ISOdate|2026-03|{{PAGELANGUAGE}}|capitalization=ucfirst|link=-}}}}");
});

test("extractChallengeCode returns null when no === header === is present", () => {
  const wikiText = "== Section ==\nSome text without a === header ===.";
  assert.equal(extractChallengeCode(wikiText), null);
});

test("extractChallengeCode leaves headers without the capitalization pattern unchanged", () => {
  const wikiText = "=== Plain Header ===\nContent.";
  const code = extractChallengeCode(wikiText);
  assert.equal(code, "Plain Header");
});

test("renderVotingIndexSection produces a header and list items", () => {
  const entries = [
    {
      challenge: "2026 - March - Three-wheelers",
      challengeCode: "{{ucfirst:{{ISOdate|2026-03|{{PAGELANGUAGE}}|capitalization=ucfirst|link=-}}}}"
    },
    {
      challenge: "2026 - March - Town_entrances",
      challengeCode: "{{ucfirst:{{ISOdate|2026-03|{{PAGELANGUAGE}}|capitalization=ucfirst|link=-}}}}"
    }
  ];

  const result = renderVotingIndexSection(entries);
  const lines = result.split("\n");

  assert.equal(lines[0], "=== {{ucfirst:{{ISOdate|2026-03|{{PAGELANGUAGE}}}}}} ===");
  assert.match(lines[1], /\* \[\[Commons:Photo challenge\/2026 - March - Three-wheelers\/Voting\|/);
  assert.match(lines[2], /\* \[\[Commons:Photo challenge\/2026 - March - Town_entrances\/Voting\|/);
});

test("renderVotingIndexSection returns empty string for no entries", () => {
  assert.equal(renderVotingIndexSection([]), "");
});
