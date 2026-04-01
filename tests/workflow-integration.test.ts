import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "./harness.js";
import { countVotes } from "../src/core/scoring.js";
import { listErrors, validateVotes, type VoterValidation } from "../src/core/validation.js";
import { parseSubmissionPage } from "../src/parsers/submitting-parser.js";
import { parseVotingPage } from "../src/parsers/voting-parser.js";
import { renderResultPage } from "../src/renderers/result-page.js";
import { reviseVotingPage } from "../src/renderers/revised-voting-page.js";
import { renderVotingPage } from "../src/renderers/voting-page.js";
import { renderWinnersPage } from "../src/renderers/winners-page.js";

const fixturesDir = path.resolve("tests", "fixtures");

function readFixture(name: string): string {
  return readFileSync(path.join(fixturesDir, name), "utf8").replace(/\r\n/g, "\n");
}

test("offline create-voting pipeline matches the expected Three-wheelers voting output", () => {
  const entries = parseSubmissionPage(readFixture("submission-page.txt"));

  const rendered = renderVotingPage("2026 - March - Three-wheelers", [
    {
      ...entries[0],
      user: "Mozzihh",
      uploaded: "2026-03-30T08:25:06Z",
      width: 2592,
      height: 1944,
      comment: "own work",
      ownWork: true,
      exists: true,
      active: true
    },
    {
      ...entries[1],
      user: "Trop86",
      uploaded: "2026-03-29T14:37:29Z",
      width: 2310,
      height: 2392,
      comment: "own work",
      ownWork: true,
      exists: true,
      active: true
    }
  ]);

  assert.equal(rendered.text, readFixture("create-voting-three-wheelers-expected.txt"));
  assert.equal(rendered.includedCount, 2);
  assert.equal(rendered.issueCount, 0);
});

test("offline process-challenge pipeline matches expected Orange snippet outputs", () => {
  const source = readFixture("voting-page-historical-live.txt");
  const parsed = parseVotingPage(source);
  const voters: VoterValidation[] = [
    { voter: "Fischer1961", editCount: 100, regDate: "2020-01-01", error: 0, note: 0, isRegistered: true, isBlocked: false },
    { voter: "Tn.kuvat", editCount: 100, regDate: "2020-01-01", error: 0, note: 0, isRegistered: true, isBlocked: false },
    { voter: "Maryam Yazdanisheldareh", editCount: 100, regDate: "2020-01-01", error: 0, note: 0, isRegistered: true, isBlocked: false },
    { voter: "Sindugab", editCount: 100, regDate: "2020-01-01", error: 0, note: 0, isRegistered: true, isBlocked: false }
  ];

  const validated = validateVotes(parsed.votes, voters, "2026 - February - Orange");
  const scored = countVotes(parsed.files, validated);
  const errors = listErrors(validated, voters, "2026 - February - Orange");

  assert.equal(renderResultPage(scored, 4, errors), readFixture("orange-snippet-result-expected.txt"));
  assert.equal(renderWinnersPage(scored, "2026 - February - Orange"), readFixture("orange-snippet-winners-expected.txt"));
  assert.equal(reviseVotingPage(source), readFixture("revised-orange-live-expected.txt"));
});
