import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "./harness.js";
import { parseVotingChallenges, parseVotingPage } from "../src/parsers/voting-parser.js";

const fixturesDir = path.resolve("tests", "fixtures");

test("parseVotingChallenges deduplicates challenge links from the voting index", () => {
  const wikiText = [
    "<!-- Commons:Photo challenge/2026 - Hidden/Voting -->",
    "* [[Commons:Photo challenge/2026 - February - First aid/Voting|First aid]]",
    "* [[Commons:Photo challenge/2026 - February - First aid/Voting|First aid duplicate]]",
    "* [[Commons:Photo challenge/2026 - March - Three-wheelers/Voting|Three-wheelers]]"
  ].join("\n");

  const challenges = parseVotingChallenges(wikiText);

  assert.deepEqual(challenges, [
    { raw: "2026 - February - First aid" },
    { raw: "2026 - March - Three-wheelers" }
  ]);
});

test("parseVotingPage handles the current live voting-page format from Three-wheelers", () => {
  const wikiText = readFileSync(path.join(fixturesDir, "voting-page-current-live.txt"), "utf8");

  const parsed = parseVotingPage(wikiText);

  assert.equal(parsed.files.length, 2);
  assert.equal(parsed.votes.length, 1);
  assert.deepEqual(parsed.files[0], {
    num: 1,
    fileName: "20260328 3-wheeler.jpg",
    title: "Marine three-wheeler, Turku",
    creator: "Tn.kuvat"
  });
  assert.deepEqual(parsed.files[1], {
    num: 8,
    fileName: "Three Wheel Vehicles at Malacca.jpg",
    title: "Three Wheel Vehicles at Malacca",
    creator: "Pauloleong2002"
  });
  assert.equal(parsed.votes[0]?.voter, "Howdy.carabao");
  assert.equal(parsed.votes[0]?.timestamp, "17:12, 1 April 2026 (UTC)");
});

test("parseVotingPage handles the historical live voting-page format from Orange", () => {
  const wikiText = readFileSync(path.join(fixturesDir, "voting-page-historical-live.txt"), "utf8");

  const parsed = parseVotingPage(wikiText);

  assert.equal(parsed.files.length, 2);
  assert.equal(parsed.votes.length, 4);
  assert.deepEqual(parsed.files[0], {
    num: 1,
    fileName: "Dark Butterfly.jpg",
    title: "A butterfly lives in silhouette",
    creator: "Saman Mokhtabad"
  });
  assert.equal(parsed.votes[0]?.voter, "Fischer1961");
  assert.equal(parsed.votes[1]?.voter, "Tn.kuvat");
  assert.equal(parsed.votes[1]?.timestamp, null);
  assert.equal(parsed.votes[3]?.voter, "Sindugab");
  assert.equal(parsed.votes[3]?.timestamp, "14:34, 23 March 2026 (UTC)");
});
