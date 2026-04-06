import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { test } from "./harness.js";
import { runCli } from "../src/cli/index.js";
import { getJobOutputPaths } from "../src/infra/output-paths.js";

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
  await rm(getJobOutputPaths("seed-orange").jobRoot, { recursive: true, force: true });
  await rm(getJobOutputPaths("seed-first-aid").jobRoot, { recursive: true, force: true });
});
