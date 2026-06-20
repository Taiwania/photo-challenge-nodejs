import assert from "node:assert/strict";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { test } from "./harness.js";
import { getJobOutputPaths } from "../src/infra/output-paths.js";
import { buildMaintenancePublishEntries } from "../src/workflows/maintenance-publish.js";
import { publishMaintenanceEditPlans, publishStandardPages, readExistingPageContent } from "../src/workflows/publish-service.js";
import type { CommonsBot, ReadPageResult, SavePageResult } from "../src/services/commons-bot.js";

function makeFakeBot(pages: Map<string, string>) {
  const saves: Array<{ title: string; text: string; summary: string }> = [];
  const bot: CommonsBot = {
    async readPage(title: string): Promise<ReadPageResult> {
      const content = pages.get(title);
      if (content === undefined) {
        throw new Error(`Page does not exist: ${title}`);
      }
      return { title, content, revisionTimestamp: null, revisionId: null };
    },
    async savePage(title: string, text: string, summary: string): Promise<SavePageResult> {
      saves.push({ title, text, summary });
      pages.set(title, text);
      return { title, newRevisionId: saves.length, result: "Success" };
    },
    async getCurrentUser() { return "Example"; },
    async listPagesByPrefix() { return []; },
    async listFileInfo() { return []; },
    async getUserInfo() { return null; },
    async userHasPhotoChallengeParticipation() { return false; }
  };

  return { bot, saves };
}

const maintenancePlanJson = JSON.stringify({
  primaryChallenge: "2026 - February - Orange",
  notifications: [
    {
      recipient: "Example Winner",
      fileName: "Orange One.jpg",
      rank: 1,
      targetTitle: "User talk:Example Winner",
      sectionHeading: "[[Commons:Photo challenge/2026 - February - Orange/Winners]]",
      bodyText: "{{Photo Challenge Gold|File:Orange One.jpg|Orange|2026|February}}--~~~~",
      editSummary: "Announcing Photo Challenge winners"
    }
  ],
  assessmentPlans: [
    {
      fileTitle: "File:Orange One.jpg",
      templateText: "{{Photo challenge winner|1|Orange|2026|February}}\n\n",
      editSummary: "Assessment added - congratulations"
    }
  ]
});

test("readExistingPageContent returns null for missing pages", async () => {
  const { bot } = makeFakeBot(new Map());
  assert.equal(await readExistingPageContent(bot, "Missing page"), null);
});

test("publishStandardPages saves each planned page and reports messages", async () => {
  const { bot, saves } = makeFakeBot(new Map());
  const messages: string[] = [];

  const count = await publishStandardPages(
    bot,
    [
      {
        label: "Result Page",
        targetTitle: "User:Example/Sandbox/Result",
        content: "result text",
        editSummary: "Create result"
      }
    ],
    (message) => messages.push(message)
  );

  assert.equal(count, 1);
  assert.deepEqual(saves.map((save) => save.title), ["User:Example/Sandbox/Result"]);
  assert.match(messages.join("\n"), /Published Result Page to User:Example\/Sandbox\/Result/);
});

test("publishMaintenanceEditPlans skips unchanged live entries and records published history", async () => {
  const jobId = "publish-service-maintenance";
  const paths = getJobOutputPaths(jobId);
  await rm(paths.jobRoot, { recursive: true, force: true });
  await mkdir(paths.generatedDir, { recursive: true });
  await mkdir(paths.logsDir, { recursive: true });

  const entries = buildMaintenancePublishEntries(maintenancePlanJson, "Example@Bot", "live");
  const notification = entries.find((entry) => entry.type === "notifications");
  const assessment = entries.find((entry) => entry.type === "file-assessment");
  assert(notification);
  assert(assessment);

  const { bot, saves } = makeFakeBot(new Map([
    ["User talk:Example Winner", `== ${notification.sections?.[0]?.heading} ==\n${notification.sections?.[0]?.bodyText}`],
    ["File:Orange One.jpg", "Intro\n=={{int:license-header}}==\nLicense"]
  ]));
  const messages: string[] = [];

  const counts = await publishMaintenanceEditPlans(bot, jobId, entries, "live", (message) => messages.push(message));

  assert.equal(counts.skippedTotal, 1);
  assert.equal(counts.publishedTotal, 1);
  assert.equal(counts.fileAssessments, 1);
  assert.deepEqual(saves.map((save) => save.title), ["File:Orange One.jpg"]);
  assert.match(messages.join("\n"), /Skipped Winner Notification/);

  const history = JSON.parse(await readFile(path.join(paths.generatedDir, "maintenance_publish_history.json"), "utf8")) as Array<{ targetTitle: string }>;
  assert.deepEqual(history.map((record) => record.targetTitle), ["File:Orange One.jpg"]);

  await rm(paths.jobRoot, { recursive: true, force: true });
});
