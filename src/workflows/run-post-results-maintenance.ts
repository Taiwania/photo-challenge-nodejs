import path from "node:path";
import { readdir, readFile, writeFile } from "node:fs/promises";
import type { JobRequest } from "../core/models.js";
import type { ScoredVotingFile } from "../core/scoring.js";
import { config } from "../infra/config.js";
import type { JobOutputPaths } from "../infra/output-paths.js";
import {
  buildChallengeAnnouncement,
  buildFileAssessmentPlans,
  buildPreviousPageUpdate,
  buildWinnerNotifications,
  type ChallengeAnnouncementInput
} from "./post-results-maintenance.js";

export type PostResultsMaintenanceSummary = {
  sourceCount: number;
  challengeCount: number;
  fileCount: number;
  voteCount: number;
};

type MaintenanceSource = {
  challenge: string;
  jobId: string;
  files: ScoredVotingFile[];
  rawContent: string;
};

type ProgressReporter = (percent: number, step: string, message: string) => void;
type MessageReporter = (message: string) => void;

export async function runPostResultsMaintenance(
  paths: JobOutputPaths,
  request: JobRequest,
  reportProgress: ProgressReporter,
  reportMessage: MessageReporter
): Promise<PostResultsMaintenanceSummary> {
  const challenges = [request.challenge, request.pairedChallenge].filter((value): value is string => Boolean(value?.trim()));
  if (challenges.length === 0) {
    throw new Error("post-results-maintenance requires at least one challenge.");
  }

  reportProgress(18, "Loading scored results", "Looking up the latest processed challenge outputs from output/jobs.");

  const sources: MaintenanceSource[] = [];
  for (let index = 0; index < challenges.length; index += 1) {
    const challenge = challenges[index];
    const source = await loadLatestScoredFiles(challenge);
    sources.push(source);
    await writeFile(path.join(paths.inputDir, `${slugify(challenge)}_source_files.json`), source.rawContent, "utf8");
    reportMessage(`Loaded scored files for ${challenge} from job ${source.jobId}.`);
    reportProgress(18 + Math.round(((index + 1) / challenges.length) * 24), "Loading scored results", `Resolved latest files for ${challenge}`);
  }

  const challengeInputs: ChallengeAnnouncementInput[] = sources.map((source) => ({
    challenge: source.challenge,
    files: source.files
  }));

  reportProgress(50, "Building maintenance plans", "Generating winner talk-page notifications and follow-up maintenance edits.");

  const notifications = buildWinnerNotifications(request.challenge, sources[0].files);
  const assessmentPlans = buildFileAssessmentPlans(challengeInputs);
  const challengeAnnouncement = challengeInputs.length === 2 ? buildChallengeAnnouncement(challengeInputs) : null;
  const previousPageUpdate = challengeInputs.length === 2 ? buildPreviousPageUpdate(challenges) : null;

  reportProgress(78, "Writing plan artifacts", "Saving dry-run maintenance plans to the job output folder.");

  const primarySlug = slugify(request.challenge);
  await writeFile(path.join(paths.generatedDir, `${primarySlug}_winner_notifications.json`), JSON.stringify(notifications, null, 2), "utf8");
  await writeFile(path.join(paths.generatedDir, `${primarySlug}_winner_notifications.txt`), renderWinnerNotificationsText(notifications), "utf8");
  await writeFile(path.join(paths.generatedDir, `${primarySlug}_file_assessments.json`), JSON.stringify(assessmentPlans, null, 2), "utf8");

  if (challengeAnnouncement) {
    await writeFile(path.join(paths.generatedDir, `${primarySlug}_challenge_announcement.txt`), renderSectionPlan(challengeAnnouncement.targetTitle, challengeAnnouncement.sectionHeading, challengeAnnouncement.bodyText), "utf8");
  }

  if (previousPageUpdate) {
    await writeFile(path.join(paths.generatedDir, `${primarySlug}_previous_page_update.txt`), previousPageUpdate.prependText, "utf8");
  }

  const maintenancePlan = {
    mode: request.publishMode,
    primaryChallenge: request.challenge,
    pairedChallenge: request.pairedChallenge ?? null,
    sourceJobs: sources.map((source) => ({ challenge: source.challenge, jobId: source.jobId, fileCount: source.files.length })),
    notifications,
    challengeAnnouncement,
    previousPageUpdate,
    assessmentPlans
  };
  await writeFile(path.join(paths.generatedDir, `${primarySlug}_maintenance_plan.json`), JSON.stringify(maintenancePlan, null, 2), "utf8");

  const summaryLines = [
    `Action: ${request.action}`,
    `Primary challenge: ${request.challenge}`,
    `Paired challenge: ${request.pairedChallenge ?? "(none)"}`,
    `Publish mode: ${request.publishMode}`,
    "",
    `Resolved source jobs: ${sources.map((source) => `${source.challenge} -> ${source.jobId}`).join("; ")}`,
    `Winner notifications: ${notifications.length}`,
    `File assessments: ${assessmentPlans.length}`,
    `Challenge announcement: ${challengeAnnouncement ? "planned" : "skipped (requires exactly two challenges)"}`,
    `Previous page update: ${previousPageUpdate ? "planned" : "skipped (requires exactly two challenges)"}`
  ];
  await writeFile(path.join(paths.generatedDir, `${primarySlug}_summary.txt`), summaryLines.join("\n"), "utf8");

  reportMessage(`Planned ${notifications.length} winner notification(s), ${assessmentPlans.length} file assessment edit(s), and ${challengeAnnouncement ? 1 : 0} central announcement(s).`);

  return {
    sourceCount: sources.length,
    challengeCount: challenges.length,
    fileCount: sources.reduce((sum, source) => sum + source.files.length, 0),
    voteCount: 0
  };
}

async function loadLatestScoredFiles(challenge: string): Promise<MaintenanceSource> {
  const entries = await readdir(config.outputRoot, { withFileTypes: true });
  const candidates: Array<{ jobId: string; completedAt: string; filePath: string }> = [];
  const challengeSlug = slugify(challenge);

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const jobId = entry.name;
    const logPath = path.join(config.outputRoot, jobId, "logs", "job.log");
    let logContent: string;
    try {
      logContent = await readFile(logPath, "utf8");
    } catch {
      continue;
    }

    const values = parseLogFile(logContent);
    if (values.status !== "completed") continue;
    if (values.action !== "process-challenge") continue;
    if (values.challenge !== challenge) continue;

    const filePath = path.join(config.outputRoot, jobId, "generated", `${challengeSlug}_files.json`);
    try {
      await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    candidates.push({
      jobId,
      completedAt: values.completedAt ?? "",
      filePath
    });
  }

  if (candidates.length === 0) {
    throw new Error(`No completed process-challenge outputs were found for ${challenge}. Run process-challenge first.`);
  }

  candidates.sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt));
  const selected = candidates[0];
  const rawContent = await readFile(selected.filePath, "utf8");
  const parsed = JSON.parse(rawContent) as ScoredVotingFile[];

  return {
    challenge,
    jobId: selected.jobId,
    files: parsed,
    rawContent
  };
}

function parseLogFile(content: string): Record<string, string> {
  const pairs = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("=");
      return separator < 0 ? null : [line.slice(0, separator), line.slice(separator + 1)] as const;
    })
    .filter((entry): entry is readonly [string, string] => entry !== null);

  return Object.fromEntries(pairs);
}

function renderWinnerNotificationsText(notifications: Array<{ targetTitle: string; sectionHeading: string; bodyText: string }>): string {
  return notifications
    .map((notification) => [
      `Target: ${notification.targetTitle}`,
      `Heading: ${notification.sectionHeading}`,
      notification.bodyText,
      ""
    ].join("\n"))
    .join("\n");
}

function renderSectionPlan(targetTitle: string, sectionHeading: string, bodyText: string): string {
  return [
    `Target: ${targetTitle}`,
    `Heading: ${sectionHeading}`,
    "",
    bodyText,
    ""
  ].join("\n");
}

function slugify(value: string): string {
  return value
    .trim()
    .replace(/[^\w\- ]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "challenge";
}
