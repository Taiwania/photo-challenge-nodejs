import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { test } from "./harness.js";
import { runCli } from "../src/cli/index.js";
import { getJobOutputPaths } from "../src/infra/output-paths.js";
import { runPostResultsMaintenance } from "../src/workflows/run-post-results-maintenance.js";
import type { CommonsBot, ReadPageResult, SavePageResult } from "../src/services/commons-bot.js";

async function seedProcessChallengeJob(jobId: string, challenge: string, files: Array<Record<string, unknown>>): Promise<void> {
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
      "action=process-challenge",
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
  await seedProcessChallengeJob("seed-orange", "2026 - February - Orange", [
    { num: 1, fileName: "Orange winner 1.jpg", title: "Orange winner 1", creator: "Amitash", score: 10, support: 4, rank: 1 },
    { num: 2, fileName: "Orange winner 2.jpg", title: "Orange winner 2", creator: "Poco a poco", score: 8, support: 3, rank: 2 },
    { num: 3, fileName: "Orange winner 3.jpg", title: "Orange winner 3", creator: "VulpesVulpes42", score: 6, support: 2, rank: 3 }
  ]);
  await seedProcessChallengeJob("seed-first-aid", "2026 - February - First aid", [
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

test("runPostResultsMaintenance live mode auto-publishes winner notifications and file assessments only", async () => {
  await seedProcessChallengeJob("seed-orange", "2026 - February - Orange", [
    { num: 1, fileName: "Orange winner 1.jpg", title: "Orange winner 1", creator: "Amitash", score: 10, support: 4, rank: 1 },
    { num: 2, fileName: "Orange winner 2.jpg", title: "Orange winner 2", creator: "Poco a poco", score: 8, support: 3, rank: 2 },
    { num: 3, fileName: "Orange winner 3.jpg", title: "Orange winner 3", creator: "VulpesVulpes42", score: 6, support: 2, rank: 3 }
  ]);
  await seedProcessChallengeJob("seed-first-aid", "2026 - February - First aid", [
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

  assert.equal(saves.length, 9);
  assert.equal(saves.some((entry) => entry.title === "Commons talk:Photo challenge"), false);
  assert.equal(saves.some((entry) => entry.title === "Commons:Photo challenge/Previous"), false);
  assert.equal(saves.filter((entry) => entry.title.startsWith("User talk:")).length, 3);
  assert.equal(saves.filter((entry) => entry.title.startsWith("File:")).length, 6);

  const summary = await readFile(path.join(paths.generatedDir, "2026_-_February_-_Orange_summary.txt"), "utf8");
  const publishHistory = JSON.parse(await readFile(path.join(paths.generatedDir, "maintenance_publish_history.json"), "utf8")) as Array<{ targetTitle: string }>;
  assert.match(summary, /Winner notifications: 3 \(3 published to live\)/);
  assert.match(summary, /File assessments: 6 \(6 published to live\)/);
  assert.match(summary, /Challenge announcement: planned only \(use maintenance review to publish\)/);
  assert.equal(publishHistory.length, 9);
  assert.match(messages.join("\n"), /Automatically published 3 winner notification target\(s\) and 6 file assessment edit\(s\) to live\./);

  await removeJob("maintenance-live");
  await removeJob("seed-orange");
  await removeJob("seed-first-aid");
});
