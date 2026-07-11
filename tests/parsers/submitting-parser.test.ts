import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "../support/harness.js";
import {
  extractPrefixIndexPrefix,
  parseSubmissionPage,
  parseSubmittedChallenges
} from "../../src/parsers/submitting-parser.js";

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

test("parseSubmissionPage finds the real Home appliances Entries gallery and removes the submit helper", () => {
  const wikiText = readFileSync(path.join(fixturesDir, "submission-page-duo-coequal-home-appliances.txt"), "utf8");

  const entries = parseSubmissionPage(wikiText);

  assert.equal(entries.length, 40);
  assert.deepEqual(entries.slice(0, 2), [
    { fileName: "RK 1701 1353 Zweitwecker.jpg", title: "Very simple, but hundreds of thousands in use: An auxiliary ringer bell for a telephone" },
    { fileName: "RK 1701 1346 Zweitwecker.jpg", title: "Very simple, but hundreds of thousands in use: An auxiliary ringer bell for a telephone" }
  ]);
  assert.equal(entries.some((entry) => entry.fileName === "W2321-ToInsertYourPicToChallengeClickBelow.svg"), false);
  assert.equal(
    entries.find((entry) => entry.fileName === "Silicon Graphics 02 - front.jpg")?.title,
    "[[:en:SGI O2|Silicon Graphics 02]] front"
  );
});

test("parseSubmissionPage finds the real 100 years later 500px Entries gallery and keeps external sources", () => {
  const wikiText = readFileSync(path.join(fixturesDir, "submission-page-duo-reference-100-years-later.txt"), "utf8");

  const entries = parseSubmissionPage(wikiText);
  const external = entries.find((entry) => entry.fileName === "Not on Commons" && entry.sourceUrl);

  assert.equal(entries.length, 190);
  assert.equal(external?.sourceUrl, "http://memoire-net.org/article.php3?id_article=141");
});
