import assert from "node:assert/strict";
import { test } from "./harness.js";
import { summarizeMaintenanceArtifact } from "../src/web/maintenance-review.js";

test("summarizeMaintenanceArtifact reads maintenance plan counts and source jobs", () => {
  const entry = summarizeMaintenanceArtifact("2026_-_February_-_Orange_maintenance_plan.json", JSON.stringify({
    mode: "dry-run",
    primaryChallenge: "2026 - February - Orange",
    pairedChallenge: "2026 - February - First aid",
    sourceJobs: [
      { challenge: "2026 - February - Orange", jobId: "job-orange" },
      { challenge: "2026 - February - First aid", jobId: "job-first-aid" }
    ],
    notifications: [{}, {}, {}],
    challengeAnnouncement: { targetTitle: "Commons talk:Photo challenge" },
    previousPageUpdate: { prependText: "== 2026 February ==" },
    assessmentPlans: [{}, {}]
  }, null, 2));

  assert(entry);
  assert.equal(entry.type, "maintenance-plan");
  assert.equal(entry.summary, "2 source challenge(s), 3 winner notification(s), 2 assessment edit(s).");
  assert.equal(entry.excerpt.some((line) => line.includes("job-orange")), true);
});

test("summarizeMaintenanceArtifact reads notification targets and headings", () => {
  const entry = summarizeMaintenanceArtifact("2026_-_February_-_Orange_winner_notifications.txt", [
    "Target: User talk:Example",
    "Heading: Photo Challenge winner",
    "",
    "Congratulations!"
  ].join("\n"));

  assert(entry);
  assert.equal(entry.type, "notifications");
  assert.equal(entry.targetTitle, "User talk:Example");
  assert.equal(entry.heading, "Photo Challenge winner");
  assert.equal(entry.summary, "1 notification target(s) prepared.");
});

test("summarizeMaintenanceArtifact reads file assessment plan counts", () => {
  const entry = summarizeMaintenanceArtifact("2026_-_February_-_Orange_file_assessments.json", JSON.stringify([
    { targetTitle: "File:One.jpg" },
    { targetTitle: "File:Two.jpg" },
    { targetTitle: "File:Three.jpg" }
  ], null, 2));

  assert(entry);
  assert.equal(entry.type, "file-assessments");
  assert.equal(entry.summary, "3 file assessment edit(s) prepared.");
  assert.deepEqual(entry.excerpt, ["File:One.jpg", "File:Two.jpg", "File:Three.jpg"]);
});
