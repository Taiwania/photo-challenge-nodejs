import assert from "node:assert/strict";
import { test } from "./harness.js";
import { countVotes } from "../src/core/scoring.js";
import { listErrors, validateVotes, type VoterValidation } from "../src/core/validation.js";

const challenge = "2026 - February - First aid";

test("validateVotes flags late votes and duplicate award usage while keeping valid votes countable", () => {
  const voters: VoterValidation[] = [
    {
      voter: "RegularVoter",
      editCount: 150,
      regDate: "2020-01-01",
      error: 0,
      note: 0,
      isRegistered: true,
      isBlocked: false
    },
    {
      voter: "LateVoter",
      editCount: 200,
      regDate: "2020-01-01",
      error: 0,
      note: 0,
      isRegistered: true,
      isBlocked: false
    },
    {
      voter: "BorderlineEntrant",
      editCount: 12,
      regDate: "2026-02-27",
      error: 0,
      note: 4,
      isRegistered: true,
      isBlocked: false
    }
  ];

  const votes = [
    {
      num: 1,
      award: 3 as const,
      voter: "RegularVoter",
      creator: "CreatorOne",
      line: "*{{3/3*}} -- [[User:RegularVoter|RegularVoter]] 12:00, 10 March 2026 (UTC)",
      timestamp: "12:00, 10 March 2026 (UTC)"
    },
    {
      num: 2,
      award: 3 as const,
      voter: "RegularVoter",
      creator: "CreatorTwo",
      line: "*{{3/3*}} -- [[User:RegularVoter|RegularVoter]] 12:05, 10 March 2026 (UTC)",
      timestamp: "12:05, 10 March 2026 (UTC)"
    },
    {
      num: 1,
      award: 2 as const,
      voter: "LateVoter",
      creator: "CreatorOne",
      line: "*{{2/3*}} -- [[User:LateVoter|LateVoter]] 00:05, 1 April 2026 (UTC)",
      timestamp: "00:05, 1 April 2026 (UTC)"
    }
  ];

  const validated = validateVotes(votes, voters, challenge);

  assert.equal(validated[0]?.error, 8);
  assert.equal(validated[1]?.error, 8);
  assert.equal(validated[2]?.error, 9);

  const errors = listErrors(validated, voters, challenge).join("\n");
  assert.match(errors, /after voting closed at 2026-04-01 00:00 UTC/);
  assert.match(errors, /=== Other \(potential\) Issues ===/);
  assert.match(errors, /\[\[User:BorderlineEntrant\]\] made less than required 50 edits on Commons/);
});

test("countVotes ranks by score and then support", () => {
  const files = [
    { num: 1, fileName: "One.jpg", title: "One", creator: "A" },
    { num: 2, fileName: "Two.jpg", title: "Two", creator: "B" },
    { num: 3, fileName: "Three.jpg", title: "Three", creator: "C" }
  ];
  const votes = [
    { num: 1, award: 3 as const, error: 0 },
    { num: 1, award: 0 as const, error: 0 },
    { num: 2, award: 2 as const, error: 0 },
    { num: 2, award: 1 as const, error: 0 },
    { num: 3, award: 3 as const, error: 1 }
  ];

  const ranked = countVotes(files, votes);

  assert.deepEqual(
    ranked.map((file) => ({ num: file.num, score: file.score, support: file.support, rank: file.rank })),
    [
      { num: 1, score: 3, support: 2, rank: 1 },
      { num: 2, score: 3, support: 2, rank: 1 },
      { num: 3, score: 0, support: 0, rank: 3 }
    ]
  );
});
