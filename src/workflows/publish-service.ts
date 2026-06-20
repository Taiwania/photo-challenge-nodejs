import { recordMaintenancePublish } from "../infra/maintenance-publish-history.js";
import type { CommonsBot, SavePageResult } from "../services/commons-bot.js";
import { applyMaintenancePublishEntry, type MaintenancePublishEntry, type MaintenancePublishMode } from "./maintenance-publish.js";

type MessageReporter = (message: string) => void;

export type StandardPublishPlan = {
  label: string;
  targetTitle: string;
  content: string;
  editSummary: string;
};

export type MaintenancePublishCounts = {
  notifications: number;
  fileAssessments: number;
  announcements: number;
  previousPages: number;
  publishedTotal: number;
  skippedTotal: number;
};

export async function readExistingPageContent(bot: CommonsBot, title: string): Promise<string | null> {
  try {
    const page = await bot.readPage(title);
    return page.content;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Page does not exist:")) {
      return null;
    }
    throw error;
  }
}

export async function publishStandardPages(
  bot: CommonsBot,
  entries: StandardPublishPlan[],
  reportMessage: MessageReporter
): Promise<number> {
  for (const entry of entries) {
    await bot.savePage(entry.targetTitle, entry.content, entry.editSummary);
    reportMessage(`Published ${entry.label} to ${entry.targetTitle}`);
  }

  return entries.length;
}

export async function publishMaintenanceEditPlans(
  bot: CommonsBot,
  jobId: string,
  entries: MaintenancePublishEntry[],
  mode: MaintenancePublishMode,
  reportMessage: MessageReporter
): Promise<MaintenancePublishCounts> {
  const counts: MaintenancePublishCounts = {
    notifications: 0,
    fileAssessments: 0,
    announcements: 0,
    previousPages: 0,
    publishedTotal: 0,
    skippedTotal: 0
  };

  for (const entry of entries) {
    const currentContent = await readExistingPageContent(bot, entry.liveTargetTitle);
    const nextContent = applyMaintenancePublishEntry(currentContent, entry);

    if (mode === "live" && currentContent !== null && nextContent === currentContent) {
      counts.skippedTotal += 1;
      reportMessage(`Skipped ${entry.label} for ${entry.liveTargetTitle} because the live page already matches the generated content.`);
      continue;
    }

    const saveResult = await bot.savePage(entry.targetTitle, nextContent, entry.editSummary);
    await recordPublishedMaintenanceEntry(jobId, entry, mode, saveResult);
    incrementMaintenanceCount(counts, entry);

    const revNote = saveResult.newRevisionId ? ` (revision ${saveResult.newRevisionId})` : "";
    reportMessage(`Published ${entry.label} to ${entry.targetTitle}${revNote}`);
  }

  return counts;
}

async function recordPublishedMaintenanceEntry(
  jobId: string,
  entry: MaintenancePublishEntry,
  mode: MaintenancePublishMode,
  saveResult: SavePageResult
): Promise<void> {
  await recordMaintenancePublish(jobId, {
    id: entry.id,
    type: entry.type,
    label: entry.label,
    mode,
    targetTitle: entry.targetTitle,
    liveTargetTitle: entry.liveTargetTitle,
    editSummary: entry.editSummary,
    publishedAt: new Date().toISOString(),
    revisionId: saveResult.newRevisionId,
    result: saveResult.result
  });
}

function incrementMaintenanceCount(counts: MaintenancePublishCounts, entry: MaintenancePublishEntry): void {
  counts.publishedTotal += 1;
  if (entry.type === "notifications") counts.notifications += 1;
  if (entry.type === "file-assessment") counts.fileAssessments += 1;
  if (entry.type === "announcement") counts.announcements += 1;
  if (entry.type === "previous-page") counts.previousPages += 1;
}
