import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "./harness.js";
import { renderResultPage } from "../src/renderers/result-page.js";
import { reviseVotingPage } from "../src/renderers/revised-voting-page.js";
import { renderVotingPage } from "../src/renderers/voting-page.js";
import { renderWinnersPage } from "../src/renderers/winners-page.js";

const fixturesDir = path.resolve("tests", "fixtures");

function readFixture(name: string): string {
  return readFileSync(path.join(fixturesDir, name), "utf8").replace(/\r\n/g, "\n");
}

test("renderVotingPage produces issues for invalid entries and includes valid images", () => {
  const rendered = renderVotingPage("2026 - March - Three-wheelers", [
    {
      fileName: "Valid entry.jpg",
      title: "Valid entry",
      user: "Photographer",
      uploaded: "2026-03-10T08:00:00Z",
      width: 4000,
      height: 3000,
      comment: null,
      ownWork: true,
      exists: true,
      active: true
    },
    {
      fileName: "Too late.jpg",
      title: "Too late",
      user: "Photographer",
      uploaded: "2026-04-01T13:00:00Z",
      width: 4000,
      height: 3000,
      comment: null,
      ownWork: true,
      exists: true,
      active: true
    }
  ]);

  assert.equal(rendered.includedCount, 1);
  assert.equal(rendered.issueCount, 1);
  assert.match(rendered.text, /Valid entry.jpg/);
  assert.match(rendered.text, /after the challenge closed/);
});

test("renderWinnersPage matches the real First aid winners output for the top three files", () => {
  const scoredFiles = JSON.parse(readFixture("scored-files-first-aid-top3.json")) as Array<{
    num: number;
    fileName: string;
    title: string;
    creator: string;
    score: number;
    support: number;
    rank: number;
  }>;
  const expected = readFixture("winners-first-aid-top3.txt");

  const rendered = renderWinnersPage(scoredFiles, "2026 - February - First aid");

  assert.equal(rendered, expected);
});

test("renderResultPage matches the expected table output for real First aid top-ranked files", () => {
  const scoredFiles = JSON.parse(readFixture("scored-files-first-aid-top3.json")) as Array<{
    num: number;
    fileName: string;
    title: string;
    creator: string;
    score: number;
    support: number;
    rank: number;
  }>;
  const expected = readFixture("result-first-aid-top3.txt");

  const rendered = renderResultPage(scoredFiles, 17, ["* no issues found"]);

  assert.equal(rendered, expected);
});

test("reviseVotingPage matches the current revised output for a historical Orange voting snippet", () => {
  const source = readFixture("voting-page-historical-live.txt");
  const expected = readFixture("revised-orange-live-expected.txt");

  const rendered = reviseVotingPage(source);

  assert.equal(rendered, expected);
});
