import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { test } from "./harness.js";
import { runCli } from "../src/cli/index.js";
import { getJobOutputPaths } from "../src/infra/output-paths.js";
import { runPostResultsMaintenance } from "../src/workflows/run-post-results-maintenance.js";
import type { CommonsBot, ReadPageResult, SavePageResult } from "../src/services/commons-bot.js";

async function seedVoteCountingJob(jobId: string, challenge: string, files: Array<Record<string, unknown>>, action = "count-votes-and-select-winners"): Promise<void> {
  const paths = getJobOutputPaths(jobId);
  const slug = challenge.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_").slice(0, 80) || "challenge";

  await rm(paths.jobRoot, { recursive: true, force: true });
  await mkdir(paths.generatedDir, { recursive: true });
  await mkdir(paths.logsDir, { recursive: true });
  await writeFile(path.join(paths.generatedDir, `${slug}_files.json`), JSON.stringify(files, null, 2), "utf8");
  await writeFile(
    path.join(paths.logsDir, "job.log"),
    [
      `jobId=${jobId}`,
      "status=completed",
      `action=${action}`,
      `challenge=${challenge}`,
      "publishMode=dry-run",
      "name=Example@Bot",
      "completedAt=2026-04-06T12:00:00Z"
    ].join("\n"),
    "utf8"
  );
}

async function removeJob(jobId: string): Promise<void> {
  await rm(getJobOutputPaths(jobId).jobRoot, { recursive: true, force: true });
}

test("runCli executes post-results-maintenance in dry-run mode from local scored outputs", async () => {
  await seedVoteCountingJob("seed-orange", "2026 - February - Orange", [
    { num: 1, fileName: "Orange winner 1.jpg", title: "Orange winner 1", creator: "Amitash", score: 10, support: 4, rank: 1 },
    { num: 2, fileName: "Orange winner 2.jpg", title: "Orange winner 2", creator: "Poco a poco", score: 8, support: 3, rank: 2 },
    { num: 3, fileName: "Orange winner 3.jpg", title: "Orange winner 3", creator: "VulpesVulpes42", score: 6, support: 2, rank: 3 }
  ]);
  await seedVoteCountingJob("seed-first-aid", "2026 - February - First aid", [
    { num: 1, fileName: "First aid winner 1.jpg", title: "First aid winner 1", creator: "MedicOne", score: 10, support: 4, rank: 1 },
    { num: 2, fileName: "First aid winner 2.jpg", title: "First aid winner 2", creator: "BlueSunrise", score: 8, support: 3, rank: 2 },
    { num: 3, fileName: "First aid winner 3.jpg", title: "First aid winner 3", creator: "Quickresponse", score: 6, support: 2, rank: 3 }
  ]);

  const logs: string[] = [];
  const errors: string[] = [];
  const exitCode = await runCli(
    [
      "post-results-maintenance",
      "--challenge", "2026 - February - Orange",
      "--paired-challenge", "2026 - February - First aid",
      "--name", "Example@Bot",
      "--bot-password", "secret",
      "--publish-mode", "dry-run"
    ],
    {
      log: (message: string) => logs.push(message),
      error: (message: string) => errors.push(message)
    }
  );

  assert.equal(exitCode, 0);
  assert.equal(errors.length, 0);

  const jobId = logs.join("\n").match(/Started job ([0-9a-f-]+)/)?.[1];
  assert.ok(jobId);
  const jobPaths = getJobOutputPaths(jobId!);
  const summary = await readFile(path.join(jobPaths.generatedDir, "2026_-_February_-_Orange_summary.txt"), "utf8");
  const announcement = await readFile(path.join(jobPaths.generatedDir, "2026_-_February_-_Orange_challenge_announcement.txt"), "utf8");
  const notifications = await readFile(path.join(jobPaths.generatedDir, "2026_-_February_-_Orange_winner_notifications.json"), "utf8");

  assert.match(summary, /Winner notifications: 3/);
  assert.match(summary, /Challenge announcement: planned/);
  assert.match(announcement, /Commons talk:Photo challenge/);
  assert.match(notifications, /User talk:Amitash/);

  await rm(jobPaths.jobRoot, { recursive: true, force: true });
  await removeJob("seed-orange");
  await removeJob("seed-first-aid");
});

test("runCli creates duo maintenance plans from local scored entry artifacts", async () => {
  await seedVoteCountingJob("seed-duo-home", "2016 - December - Home appliances", [
    {
      num: 1,
      fileName: "Outside.jpg",
      title: "Outside",
      creator: "PairMaker",
      score: 26,
      support: 13,
      rank: 1,
      mode: "duo-coequal",
      members: [
        { role: "submission", fileName: "Outside.jpg", title: "Outside", creator: "PairMaker" },
        { role: "submission", fileName: "Inside.jpg", title: "Inside", creator: "PairMaker" }
      ]
    },
    {
      num: 2,
      fileName: "Second outside.jpg",
      title: "Second outside",
      creator: "SecondPair",
      score: 20,
      support: 8,
      rank: 2,
      mode: "duo-coequal",
      members: [
        { role: "submission", fileName: "Second outside.jpg", title: "Second outside", creator: "SecondPair" },
        { role: "submission", fileName: "Second inside.jpg", title: "Second inside", creator: "SecondPair" }
      ]
    }
  ]);

  const logs: string[] = [];
  const errors: string[] = [];
  const exitCode = await runCli(
    [
      "post-results-maintenance",
      "--challenge", "2016 - December - Home appliances",
      "--name", "Example@Bot",
      "--bot-password", "secret",
      "--publish-mode", "dry-run"
    ],
    {
      log: (message: string) => logs.push(message),
      error: (message: string) => errors.push(message)
    }
  );

  assert.equal(exitCode, 0);
  assert.equal(errors.length, 0);

  const jobId = logs.join("\n").match(/Started job ([0-9a-f-]+)/)?.[1];
  assert.ok(jobId);
  const jobPaths = getJobOutputPaths(jobId!);
  const notifications = await readFile(path.join(jobPaths.generatedDir, "2016_-_December_-_Home_appliances_winner_notifications.json"), "utf8");
  const assessments = JSON.parse(await readFile(path.join(jobPaths.generatedDir, "2016_-_December_-_Home_appliances_file_assessments.json"), "utf8")) as Array<{ fileTitle: string }>;
  const summary = await readFile(path.join(jobPaths.generatedDir, "2016_-_December_-_Home_appliances_summary.txt"), "utf8");

  assert.match(notifications, /File:Outside\.jpg/);
  assert.doesNotMatch(notifications, /File:Inside\.jpg/);
  assert.deepEqual(assessments.map((plan) => plan.fileTitle), [
    "File:Outside.jpg",
    "File:Inside.jpg",
    "File:Second outside.jpg",
    "File:Second inside.jpg"
  ]);
  assert.match(summary, /Winner notifications: 2/);
  assert.match(summary, /File assessments: 4/);

  await rm(jobPaths.jobRoot, { recursive: true, force: true });
  await removeJob("seed-duo-home");
});

test("runPostResultsMaintenance can recover scored winners from a published Winners page", async () => {
  const paths = getJobOutputPaths("maintenance-published-winners");
  await rm(paths.jobRoot, { recursive: true, force: true });
  await mkdir(paths.inputDir, { recursive: true });
  await mkdir(paths.generatedDir, { recursive: true });
  await mkdir(paths.logsDir, { recursive: true });

  const winnersText = await readFile(path.join("tests", "fixtures", "winners-first-aid-top3.txt"), "utf8");
  const fakeBot: CommonsBot = {
    async readPage(title: string): Promise<ReadPageResult> {
      assert.equal(title, "Commons:Photo challenge/2026 - February - First aid/Winners");
      return {
        title,
        content: winnersText,
        revisionTimestamp: "2026-03-01T00:00:00Z",
        revisionId: 123
      };
    },
    async savePage(): Promise<SavePageResult> {
      throw new Error("dry-run fallback should not publish");
    },
    async getCurrentUser() { return "Example"; },
    async listPagesByPrefix() { return []; },
    async listFileInfo() { return []; },
    async getUserInfo() { return null; },
    async userHasPhotoChallengeParticipation() { return false; }
  };

  const messages: string[] = [];
  await runPostResultsMaintenance(
    paths,
    {
      action: "post-results-maintenance",
      challenge: "2026 - February - First aid",
      credentials: { name: "Example@Bot", botPassword: "secret" },
      publishMode: "dry-run"
    },
    () => {},
    (message) => messages.push(message),
    { bot: fakeBot, jobId: "maintenance-published-winners", loginName: "Example@Bot" }
  );

  const summary = await readFile(path.join(paths.generatedDir, "2026_-_February_-_First_aid_summary.txt"), "utf8");
  const notifications = await readFile(path.join(paths.generatedDir, "2026_-_February_-_First_aid_winner_notifications.json"), "utf8");
  const sourceFiles = JSON.parse(await readFile(path.join(paths.inputDir, "2026_-_February_-_First_aid_source_files.json"), "utf8")) as Array<{ creator: string; title: string }>;

  assert.match(summary, /Winner notifications: 3/);
  assert.match(notifications, /User talk:Aciarium/);
  assert.equal(sourceFiles[0].creator, "Aciarium");
  assert.equal(sourceFiles[0].title.includes("<br"), false);
  assert.match(messages.join("\n"), /Loaded scored files for 2026 - February - First aid from (job|published page)/);

  await removeJob("maintenance-published-winners");
});

test("runPostResultsMaintenance rejects duo winners fallback without a local scored artifact", async () => {
  const paths = getJobOutputPaths("maintenance-duo-no-local");
  await rm(paths.jobRoot, { recursive: true, force: true });
  await mkdir(paths.inputDir, { recursive: true });
  await mkdir(paths.generatedDir, { recursive: true });
  await mkdir(paths.logsDir, { recursive: true });

  const fakeBot: CommonsBot = {
    async readPage(title: string): Promise<ReadPageResult> {
      assert.equal(title, "Commons:Photo challenge/2016 - December - Home appliances/Winners");
      return {
        title,
        content: [
          '{| class = "wikitable"',
          "|-",
          "! Rank !! 1 !! 2 !! 3",
          "|-",
          "| Image || [[File:Outside.jpg|x240px]]<br/>[[File:Inside.jpg|x240px]] || ||",
          "|}"
        ].join("\n"),
        revisionTimestamp: "2017-03-01T00:00:00Z",
        revisionId: 234
      };
    },
    async savePage(): Promise<SavePageResult> {
      throw new Error("duo fallback should not publish");
    },
    async getCurrentUser() { return "Example"; },
    async listPagesByPrefix() { return []; },
    async listFileInfo() { return []; },
    async getUserInfo() { return null; },
    async userHasPhotoChallengeParticipation() { return false; }
  };

  await assert.rejects(
    () => runPostResultsMaintenance(
      paths,
      {
        action: "post-results-maintenance",
        challenge: "2016 - December - Home appliances",
        credentials: { name: "Example@Bot", botPassword: "secret" },
        publishMode: "dry-run"
      },
      () => {},
      () => {},
      { bot: fakeBot, jobId: "maintenance-duo-no-local", loginName: "Example@Bot" }
    ),
    /Duo winners page .*Run count-votes-and-select-winners/
  );

  await removeJob("maintenance-duo-no-local");
});

test("runPostResultsMaintenance live mode auto-publishes notifications, announcement, previous page, and file assessments", async () => {
  await seedVoteCountingJob("seed-orange", "2026 - February - Orange", [
    { num: 1, fileName: "Orange winner 1.jpg", title: "Orange winner 1", creator: "Amitash", score: 10, support: 4, rank: 1 },
    { num: 2, fileName: "Orange winner 2.jpg", title: "Orange winner 2", creator: "Poco a poco", score: 8, support: 3, rank: 2 },
    { num: 3, fileName: "Orange winner 3.jpg", title: "Orange winner 3", creator: "VulpesVulpes42", score: 6, support: 2, rank: 3 }
  ]);
  await seedVoteCountingJob("seed-first-aid", "2026 - February - First aid", [
    { num: 1, fileName: "First aid winner 1.jpg", title: "First aid winner 1", creator: "MedicOne", score: 10, support: 4, rank: 1 },
    { num: 2, fileName: "First aid winner 2.jpg", title: "First aid winner 2", creator: "BlueSunrise", score: 8, support: 3, rank: 2 },
    { num: 3, fileName: "First aid winner 3.jpg", title: "First aid winner 3", creator: "Quickresponse", score: 6, support: 2, rank: 3 }
  ]);

  const paths = getJobOutputPaths("maintenance-live");
  await rm(paths.jobRoot, { recursive: true, force: true });
  await mkdir(paths.inputDir, { recursive: true });
  await mkdir(paths.generatedDir, { recursive: true });
  await mkdir(paths.logsDir, { recursive: true });

  const readPages = new Map<string, ReadPageResult>([
    ["User talk:Amitash", { title: "User talk:Amitash", content: "== Existing ==\nWelcome", revisionTimestamp: null, revisionId: 1 }],
    ["User talk:Poco a poco", { title: "User talk:Poco a poco", content: "", revisionTimestamp: null, revisionId: 2 }],
    ["User talk:VulpesVulpes42", { title: "User talk:VulpesVulpes42", content: "", revisionTimestamp: null, revisionId: 3 }],
    ["Commons:Photo challenge/2026 - February - Orange/Winners", { title: "Commons:Photo challenge/2026 - February - Orange/Winners", content: "{{Photo challenge winners table}}", revisionTimestamp: null, revisionId: 12 }],
    ["Commons:Photo challenge/2026 - February - First aid/Winners", { title: "Commons:Photo challenge/2026 - February - First aid/Winners", content: "{{Photo challenge winners table}}", revisionTimestamp: null, revisionId: 13 }],
    ["Commons talk:Photo challenge", { title: "Commons talk:Photo challenge", content: "== Older section ==\nArchive", revisionTimestamp: null, revisionId: 10 }],
    ["Commons:Photo challenge/Previous", { title: "Commons:Photo challenge/Previous", content: "== Old month ==\n{{Old winners}}", revisionTimestamp: null, revisionId: 11 }],
    ["File:Orange winner 1.jpg", { title: "File:Orange winner 1.jpg", content: "Intro\n=={{int:license-header}}==\nLicense", revisionTimestamp: null, revisionId: 4 }],
    ["File:Orange winner 2.jpg", { title: "File:Orange winner 2.jpg", content: "Intro\n[[Category:Example]]", revisionTimestamp: null, revisionId: 5 }],
    ["File:Orange winner 3.jpg", { title: "File:Orange winner 3.jpg", content: "Intro\n=={{Other versions}}==\nOther", revisionTimestamp: null, revisionId: 6 }],
    ["File:First aid winner 1.jpg", { title: "File:First aid winner 1.jpg", content: "Intro\n=={{int:license-header}}==\nLicense", revisionTimestamp: null, revisionId: 7 }],
    ["File:First aid winner 2.jpg", { title: "File:First aid winner 2.jpg", content: "Intro\n[[Category:Example]]", revisionTimestamp: null, revisionId: 8 }],
    ["File:First aid winner 3.jpg", { title: "File:First aid winner 3.jpg", content: "Intro\n=={{Other versions}}==\nOther", revisionTimestamp: null, revisionId: 9 }]
  ]);
  const saves: Array<{ title: string; text: string; summary: string }> = [];
  const fakeBot: CommonsBot = {
    async readPage(title: string): Promise<ReadPageResult> {
      const page = readPages.get(title);
      if (!page) {
        throw new Error(`Page does not exist: ${title}`);
      }
      return page;
    },
    async savePage(title: string, text: string, summary: string): Promise<SavePageResult> {
      saves.push({ title, text, summary });
      return {
        title,
        newRevisionId: saves.length,
        result: "Success"
      };
    },
    async getCurrentUser() { return "Example"; },
    async listPagesByPrefix() { return []; },
    async listFileInfo() { return []; },
    async getUserInfo() { return null; },
    async userHasPhotoChallengeParticipation() { return false; }
  };

  const messages: string[] = [];
  await runPostResultsMaintenance(
    paths,
    {
      action: "post-results-maintenance",
      challenge: "2026 - February - Orange",
      pairedChallenge: "2026 - February - First aid",
      credentials: { name: "Example@Bot", botPassword: "secret" },
      publishMode: "live"
    },
    () => {},
    (message) => messages.push(message),
    { bot: fakeBot, jobId: "maintenance-live", loginName: "Example@Bot" }
  );

  assert.equal(saves.length, 11);
  assert.equal(saves.some((entry) => entry.title === "Commons talk:Photo challenge"), true);
  assert.equal(saves.some((entry) => entry.title === "Commons:Photo challenge/Previous"), true);
  assert.equal(saves.filter((entry) => entry.title.startsWith("User talk:")).length, 3);
  assert.equal(saves.filter((entry) => entry.title.startsWith("File:")).length, 6);
  assert.equal(saves.filter((entry) => entry.title === "Commons talk:Photo challenge").length, 1);
  assert.equal(saves.filter((entry) => entry.title === "Commons:Photo challenge/Previous").length, 1);

  const summary = await readFile(path.join(paths.generatedDir, "2026_-_February_-_Orange_summary.txt"), "utf8");
  const publishHistory = JSON.parse(await readFile(path.join(paths.generatedDir, "maintenance_publish_history.json"), "utf8")) as Array<{ targetTitle: string }>;
  assert.match(summary, /Winner notifications: 3 \(3 published to live\)/);
  assert.match(summary, /File assessments: 6 \(6 published to live\)/);
  assert.match(summary, /Challenge announcement: 1 published to live/);
  assert.match(summary, /Previous page update: 1 published to live/);
  assert.equal(publishHistory.length, 11);
  assert.match(messages.join("\n"), /Published 3 winner notification target\(s\), 6 file assessment edit\(s\), 1 central announcement\(s\), and 1 Previous-page update\(s\) to live\./);

  await removeJob("maintenance-live");
  await removeJob("seed-orange");
  await removeJob("seed-first-aid");
});

test("runPostResultsMaintenance skips central announcement when a winners page is missing", async () => {
  await seedVoteCountingJob("seed-orange", "2026 - February - Orange", [
    { num: 1, fileName: "Orange winner 1.jpg", title: "Orange winner 1", creator: "Amitash", score: 10, support: 4, rank: 1 },
    { num: 2, fileName: "Orange winner 2.jpg", title: "Orange winner 2", creator: "Poco a poco", score: 8, support: 3, rank: 2 },
    { num: 3, fileName: "Orange winner 3.jpg", title: "Orange winner 3", creator: "VulpesVulpes42", score: 6, support: 2, rank: 3 }
  ]);
  await seedVoteCountingJob("seed-first-aid", "2026 - February - First aid", [
    { num: 1, fileName: "First aid winner 1.jpg", title: "First aid winner 1", creator: "MedicOne", score: 10, support: 4, rank: 1 },
    { num: 2, fileName: "First aid winner 2.jpg", title: "First aid winner 2", creator: "BlueSunrise", score: 8, support: 3, rank: 2 },
    { num: 3, fileName: "First aid winner 3.jpg", title: "First aid winner 3", creator: "Quickresponse", score: 6, support: 2, rank: 3 }
  ]);

  const paths = getJobOutputPaths("maintenance-missing-winners");
  await rm(paths.jobRoot, { recursive: true, force: true });
  await mkdir(paths.inputDir, { recursive: true });
  await mkdir(paths.generatedDir, { recursive: true });
  await mkdir(paths.logsDir, { recursive: true });

  const readPages = new Map<string, ReadPageResult>([
    ["User talk:Amitash", { title: "User talk:Amitash", content: "", revisionTimestamp: null, revisionId: 1 }],
    ["User talk:Poco a poco", { title: "User talk:Poco a poco", content: "", revisionTimestamp: null, revisionId: 2 }],
    ["User talk:VulpesVulpes42", { title: "User talk:VulpesVulpes42", content: "", revisionTimestamp: null, revisionId: 3 }],
    ["Commons:Photo challenge/2026 - February - Orange/Winners", { title: "Commons:Photo challenge/2026 - February - Orange/Winners", content: "{{Photo challenge winners table}}", revisionTimestamp: null, revisionId: 12 }],
    ["Commons:Photo challenge/Previous", { title: "Commons:Photo challenge/Previous", content: "", revisionTimestamp: null, revisionId: 11 }],
    ["File:Orange winner 1.jpg", { title: "File:Orange winner 1.jpg", content: "", revisionTimestamp: null, revisionId: 4 }],
    ["File:Orange winner 2.jpg", { title: "File:Orange winner 2.jpg", content: "", revisionTimestamp: null, revisionId: 5 }],
    ["File:Orange winner 3.jpg", { title: "File:Orange winner 3.jpg", content: "", revisionTimestamp: null, revisionId: 6 }],
    ["File:First aid winner 1.jpg", { title: "File:First aid winner 1.jpg", content: "", revisionTimestamp: null, revisionId: 7 }],
    ["File:First aid winner 2.jpg", { title: "File:First aid winner 2.jpg", content: "", revisionTimestamp: null, revisionId: 8 }],
    ["File:First aid winner 3.jpg", { title: "File:First aid winner 3.jpg", content: "", revisionTimestamp: null, revisionId: 9 }]
  ]);
  const saves: Array<{ title: string }> = [];
  const fakeBot: CommonsBot = {
    async readPage(title: string): Promise<ReadPageResult> {
      const page = readPages.get(title);
      if (!page) throw new Error(`Page does not exist: ${title}`);
      return page;
    },
    async savePage(title: string): Promise<SavePageResult> {
      saves.push({ title });
      return { title, newRevisionId: saves.length, result: "Success" };
    },
    async getCurrentUser() { return "Example"; },
    async listPagesByPrefix() { return []; },
    async listFileInfo() { return []; },
    async getUserInfo() { return null; },
    async userHasPhotoChallengeParticipation() { return false; }
  };

  const messages: string[] = [];
  await runPostResultsMaintenance(
    paths,
    {
      action: "post-results-maintenance",
      challenge: "2026 - February - Orange",
      pairedChallenge: "2026 - February - First aid",
      credentials: { name: "Example@Bot", botPassword: "secret" },
      publishMode: "sandbox"
    },
    () => {},
    (message) => messages.push(message),
    { bot: fakeBot, jobId: "maintenance-missing-winners", loginName: "Example@Bot" }
  );

  const summary = await readFile(path.join(paths.generatedDir, "2026_-_February_-_Orange_summary.txt"), "utf8");
  assert.match(summary, /Challenge announcement: skipped/);
  assert.equal(saves.some((entry) => entry.title.includes("Photo Challenge talk page Annoucement")), false);
  assert.match(messages.join("\n"), /Skipping central announcement because winner page\(s\) are not published yet/);

  await removeJob("maintenance-missing-winners");
  await removeJob("seed-orange");
  await removeJob("seed-first-aid");
});
