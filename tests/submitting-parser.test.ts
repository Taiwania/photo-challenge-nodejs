import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "./harness.js";
import {
  extractPrefixIndexPrefix,
  parseSubmissionPage,
  parseSubmittedChallenges
} from "../src/parsers/submitting-parser.js";

const fixturesDir = path.resolve("tests", "fixtures");

test("parseSubmittedChallenges strips comments and deduplicates challenge templates", () => {
  const wikiText = [
    "<!-- {{Commons:Photo challenge/2026 - April - Hidden}} -->",
    "{{Commons:Photo challenge/2026 - March - Three-wheelers}}",
    "{{Commons:Photo challenge/2026 - March - Three-wheelers}}",
    "{{Commons:Photo challenge/2026 - April - Town entrances}}"
  ].join("\n");

  const challenges = parseSubmittedChallenges(wikiText);

  assert.deepEqual(challenges, [
    {
      raw: "2026 - March - Three-wheelers",
      year: "2026",
      month: "March",
      theme: "Three-wheelers"
    },
    {
      raw: "2026 - April - Town entrances",
      year: "2026",
      month: "April",
      theme: "Town entrances"
    }
  ]);
});

test("parseSubmissionPage parses gallery entries and ignores helper images", () => {
  const wikiText = readFileSync(path.join(fixturesDir, "submission-page.txt"), "utf8");

  const entries = parseSubmissionPage(wikiText);

  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    fileName: "Three-wheeler Tempo T6 901-0005.jpg",
    title: "Three-wheeler Tempo T6 shown at exhibition"
  });
  assert.deepEqual(entries[1], {
    fileName: "Econelo Nelo 3.1 Kabinenroller 172825.jpg",
    title: "Econelo Nelo 3.1 Kabinenroller in Senden bei Ulm"
  });
});

test("extractPrefixIndexPrefix finds the submission subpage prefix", () => {
  const prefix = extractPrefixIndexPrefix("{{Special:PrefixIndex/Commons:Photo challenge/2026 - March - Three-wheelers/}}");
  assert.equal(prefix, "Commons:Photo challenge/2026 - March - Three-wheelers/");
});
