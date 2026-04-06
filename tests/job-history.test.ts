import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { test } from "./harness.js";
import { loadPersistedJob } from "../src/infra/job-history.js";
import { getJobOutputPaths } from "../src/infra/output-paths.js";

test("loadPersistedJob preserves publishMode for failed jobs", async () => {
  const jobId = "test-failed-publish-mode";
  const paths = getJobOutputPaths(jobId);

  await rm(paths.jobRoot, { recursive: true, force: true });
  await mkdir(paths.logsDir, { recursive: true });
  await writeFile(
    path.join(paths.logsDir, "job.log"),
    [
      `jobId=${jobId}`,
      "status=failed",
      "action=create-voting",
      "challenge=2026 - March - Three-wheelers",
      "publishMode=sandbox",
      "name=Example@Bot",
      "errorMessage=boom",
      "completedAt=2026-04-06T00:00:00Z"
    ].join("\n"),
    "utf8"
  );

  const job = await loadPersistedJob(jobId);

  assert.ok(job);
  assert.equal(job?.status, "failed");
  assert.equal(job?.publishMode, "sandbox");

  await rm(paths.jobRoot, { recursive: true, force: true });
});
