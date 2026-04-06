import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import type { Request, Response } from "express";
import type { JobProgress, JobRequest, PublishMode } from "../../core/models.js";
import { getCredentialPassword, rememberCredential } from "../../infra/credential-store.js";
import { config } from "../../infra/config.js";
import { loadPersistedJob } from "../../infra/job-history.js";
import { jobStore } from "../../infra/job-store.js";
import { getJobOutputPaths } from "../../infra/output-paths.js";
import { createCommonsBot } from "../../services/commons-bot.js";
import { runJob } from "../../workflows/run-job.js";
import { summarizeMaintenanceArtifact } from "../maintenance-review.js";
import { applyMaintenancePublishEntry, buildMaintenancePublishEntries, type MaintenancePublishEntry, type MaintenancePublishMode } from "../maintenance-publish.js";
import { buildPublishableArtifacts, summarizePublishDiff, type PublishableArtifact } from "../publish-review.js";
import { buildHomePageViewModel } from "./home-controller.js";

type ArtifactKind = "generated" | "logs";

type ArtifactEntry = {
  name: string;
  kind: ArtifactKind;
  previewUrl: string;
  downloadUrl: string;
};

type CoreArtifactType = "voting" | "result" | "winners" | "revised" | "maintenance-plan" | "notifications" | "announcement" | "previous-page" | "file-assessments";

type CoreArtifactEntry = ArtifactEntry & {
  type: CoreArtifactType;
  label: string;
  description: string;
  isActive?: boolean;
};

type MaintenancePublishReviewEntry = MaintenancePublishEntry & {
  status: "new" | "same" | "changed";
  statusLabel: string;
  summary: string;
  diffSummary: string;
  selected: boolean;
};

type PublishReviewEntry = {
  label: string;
  fileName: string;
  targetTitle: string;
  previewUrl: string;
  downloadUrl: string;
  status: "new" | "same" | "changed";
  statusLabel: string;
  summary: string;
  firstDifferenceLine: number | null;
  diffRows: Array<{
    kind: string;
    currentLineNumber: number | null;
    nextLineNumber: number | null;
    currentText: string;
    nextText: string;
    isSame: boolean;
    isAdd: boolean;
    isRemove: boolean;
    isChange: boolean;
    isSkip: boolean;
  }>;
};

const workflowArtifactDefinitions: Record<string, Array<{
  type: CoreArtifactType;
  suffix: string;
  label: string;
  description: string;
}>> = {
  "create-voting": [
    {
      type: "voting",
      suffix: "_voting.txt",
      label: "Voting Page",
      description: "Preview the generated voting page wikitext."
    }
  ],
  "process-challenge": [
    {
      type: "result",
      suffix: "_result.txt",
      label: "Result Page",
      description: "Review the processed challenge result output."
    },
    {
      type: "winners",
      suffix: "_winners.txt",
      label: "Winners Page",
      description: "Open the final winners template content."
    },
    {
      type: "revised",
      suffix: "_revised.txt",
      label: "Revised Voting",
      description: "Inspect the cleaned voting page after validation."
    }
  ],
  "post-results-maintenance": [
    {
      type: "maintenance-plan",
      suffix: "_maintenance_plan.json",
      label: "Maintenance Plan",
      description: "Inspect the combined dry-run edit plan for the post-results follow-up workflow."
    },
    {
      type: "notifications",
      suffix: "_winner_notifications.txt",
      label: "Winner Notifications",
      description: "Review the talk-page notification messages for podium winners."
    },
    {
      type: "announcement",
      suffix: "_challenge_announcement.txt",
      label: "Central Announcement",
      description: "Preview the combined Commons talk announcement for the paired challenges."
    },
    {
      type: "previous-page",
      suffix: "_previous_page_update.txt",
      label: "Previous Page Update",
      description: "Preview the text that should be prepended to Commons:Photo challenge/Previous."
    },
    {
      type: "file-assessments",
      suffix: "_file_assessments.json",
      label: "File Assessments",
      description: "Inspect the planned assessment edits for top-ranked files."
    }
  ]
};

const VALID_PUBLISH_MODES = new Set<PublishMode>(["dry-run", "sandbox", "live"]);

function buildJobRequest(body: Record<string, unknown>): JobRequest {
  const rawPublishMode = String(body.publishMode ?? "dry-run");
  const publishMode: PublishMode = VALID_PUBLISH_MODES.has(rawPublishMode as PublishMode)
    ? (rawPublishMode as PublishMode)
    : "dry-run";

  return {
    action: String(body.action ?? "process-challenge"),
    challenge: String(body.challenge ?? "").trim(),
    pairedChallenge: String(body.pairedChallenge ?? "").trim() || undefined,
    credentials: {
      name: String(body.name ?? "").trim(),
      botPassword: String(body.botPassword ?? "")
    },
    publishMode
  };
}

function shouldRememberCredential(body: Record<string, unknown>): boolean {
  return body.rememberCredential === "on" || body.rememberCredential === "true";
}

function getRouteId(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getArtifactName(value: string | string[] | undefined): string {
  const name = Array.isArray(value) ? value[0] ?? "" : value ?? "";
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return "";
  }
  return name;
}

function getArtifactKind(value: string | string[] | undefined): ArtifactKind | null {
  const kind = Array.isArray(value) ? value[0] ?? "" : value ?? "";
  return kind === "generated" || kind === "logs" ? kind : null;
}

function normalizeSelectedValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter(Boolean);
  }
  if (typeof value === "string" && value) {
    return [value];
  }
  return [];
}

function getReviewMode(value: unknown, job: JobProgress): "sandbox" | "live" {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "live" || raw === "sandbox") {
    return raw;
  }

  return job.publishMode === "live" ? "live" : "sandbox";
}

function formatActionLabel(action: string): string {
  if (action === "create-voting") {
    return "Prepare voting page";
  }

  if (action === "process-challenge") {
    return "Count votes and publish results";
  }

  if (action === "post-results-maintenance") {
    return "Plan post-results maintenance";
  }

  return action;
}

async function getJobSnapshot(jobId: string): Promise<JobProgress | null> {
  return jobStore.get(jobId) ?? (await loadPersistedJob(jobId));
}

export async function createJob(request: Request, response: Response) {
  const body = request.body as Record<string, unknown>;
  const jobRequest = buildJobRequest(body);
  const rememberRequested = shouldRememberCredential(body);

  if (!jobRequest.credentials.botPassword && jobRequest.credentials.name) {
    jobRequest.credentials.botPassword = (await getCredentialPassword(jobRequest.credentials.name)) ?? "";
  }

  if (!jobRequest.challenge || !jobRequest.credentials.name || !jobRequest.credentials.botPassword) {
    response.status(400).render(
      "home",
      await buildHomePageViewModel({
        error: "Name, stored Bot Password, and Challenge are required. Enter a password or save one for this machine.",
        defaults: {
          name: jobRequest.credentials.name,
          challenge: jobRequest.challenge,
          pairedChallenge: jobRequest.pairedChallenge,
          action: jobRequest.action,
          publishMode: jobRequest.publishMode
        }
      })
    );
    return;
  }

  if (rememberRequested) {
    await rememberCredential(jobRequest.credentials.name, jobRequest.credentials.botPassword);
  }

  const placeholderJob = jobStore.create(jobRequest, getJobOutputPaths("pending").jobRoot);
  const actualOutputDir = getJobOutputPaths(placeholderJob.id).jobRoot;
  jobStore.update(placeholderJob.id, { outputDir: actualOutputDir });

  void runJob(placeholderJob.id, jobRequest);

  response.redirect(`/jobs/${placeholderJob.id}`);
}

export async function renderJobProgress(request: Request, response: Response) {
  const job = await getJobSnapshot(getRouteId(request.params.id));
  if (!job) {
    response.status(404).send("Job not found");
    return;
  }

  const coreArtifacts = job.status === "completed" ? await loadCoreArtifacts(job.id, job.action) : [];

  response.render("progress", {
    title: `Job ${job.id}`,
    job,
    jobActionLabel: formatActionLabel(job.action),
    coreArtifacts
  });
}

export async function getJobStatus(request: Request, response: Response) {
  const job = await getJobSnapshot(getRouteId(request.params.id));
  if (!job) {
    response.status(404).json({ error: "Job not found" });
    return;
  }

  response.json(job);
}

export async function renderJobResult(request: Request, response: Response) {
  const job = await getJobSnapshot(getRouteId(request.params.id));
  if (!job) {
    response.status(404).send("Job not found");
    return;
  }

  const artifacts = await listArtifacts(job.id);
  const { coreArtifacts, otherGeneratedFiles } = classifyGeneratedArtifacts(artifacts.generated, job.action);
  const reviewMode = getReviewMode(request.query.mode, job);
  const notice = typeof request.query.notice === "string" ? request.query.notice : null;
  const canPublishReview = job.action === "create-voting" || job.action === "process-challenge";
  const hasMaintenanceReview = job.action === "post-results-maintenance";

  response.render("result", {
    title: `Result ${job.id}`,
    job,
    jobActionLabel: formatActionLabel(job.action),
    coreArtifacts,
    generatedFiles: otherGeneratedFiles,
    logFiles: artifacts.logs,
    publishReviewUrl: `/jobs/${job.id}/publish-review?mode=${reviewMode}`,
    publishNotice: notice,
    publishModeLabel: reviewMode,
    canPublishReview,
    hasMaintenanceReview,
    maintenanceReviewUrl: `/jobs/${job.id}/maintenance-review`
  });
}

export async function renderPublishReview(request: Request, response: Response) {
  const job = await getJobSnapshot(getRouteId(request.params.id));
  if (!job) {
    response.status(404).send("Job not found");
    return;
  }

  const mode = getReviewMode(request.query.mode, job);
  const review = await loadPublishReview(job, mode);

  response.render("publish-review", {
    title: `Publish review ${job.id}`,
    job,
    jobActionLabel: formatActionLabel(job.action),
    reviewEntries: review.entries,
    reviewMode: mode,
    alternateMode: mode === "sandbox" ? "live" : "sandbox",
    alternateModeUrl: `/jobs/${job.id}/publish-review?mode=${mode === "sandbox" ? "live" : "sandbox"}`,
    reviewWarning: review.warning,
    reviewNotice: typeof request.query.notice === "string" ? request.query.notice : null
  });
}

export async function renderMaintenanceReview(request: Request, response: Response) {
  const job = await getJobSnapshot(getRouteId(request.params.id));
  if (!job) {
    response.status(404).send("Job not found");
    return;
  }

  if (job.action !== "post-results-maintenance") {
    response.redirect(`/jobs/${job.id}/result?notice=${encodeURIComponent("This job uses the standard result view instead of maintenance review.")}`);
    return;
  }

  const mode = getReviewMode(request.query.mode, job) as MaintenancePublishMode;
  const selectedIds = normalizeSelectedValues(request.query.selected);
  const review = await loadMaintenancePublishReview(job, mode, selectedIds);

  response.render("maintenance-review", {
    title: `Maintenance review ${job.id}`,
    job,
    jobActionLabel: formatActionLabel(job.action),
    overview: review.overview,
    reviewEntries: review.entries,
    reviewMode: mode,
    alternateMode: mode === "sandbox" ? "live" : "sandbox",
    alternateModeUrl: `/jobs/${job.id}/maintenance-review?mode=${mode === "sandbox" ? "live" : "sandbox"}`,
    reviewWarning: review.warning,
    reviewNotice: typeof request.query.notice === "string" ? request.query.notice : null,
    canPublish: review.canPublish
  });
}

export async function publishMaintenanceOutputs(request: Request, response: Response) {
  const job = await getJobSnapshot(getRouteId(request.params.id));
  if (!job) {
    response.status(404).send("Job not found");
    return;
  }

  if (job.action !== "post-results-maintenance") {
    response.redirect(`/jobs/${job.id}/result?notice=${encodeURIComponent("This job does not support maintenance publishing.")}`);
    return;
  }

  const body = request.body as Record<string, unknown>;
  const mode = getReviewMode(body.mode ?? request.query.mode, job) as MaintenancePublishMode;
  const selectedIds = normalizeSelectedValues(body.selected);
  if (selectedIds.length === 0) {
    response.redirect(`/jobs/${job.id}/maintenance-review?mode=${mode}&notice=${encodeURIComponent("Select at least one maintenance entry to publish.")}`);
    return;
  }

  const loginName = resolveLoginName(job);
  const botPassword = await resolveBotPassword(loginName);
  if (!loginName || !botPassword) {
    response.redirect(`/jobs/${job.id}/maintenance-review?mode=${mode}&notice=${encodeURIComponent("A saved BotPassword is required before maintenance publish can proceed.")}`);
    return;
  }

  const generatedFiles = await loadGeneratedFiles(job.id);
  const planFile = generatedFiles.find((artifact) => artifact.name.endsWith("_maintenance_plan.json"));
  if (!planFile) {
    response.redirect(`/jobs/${job.id}/maintenance-review?mode=${mode}&notice=${encodeURIComponent("Maintenance plan JSON was not found for this job.")}`);
    return;
  }

  const entries = buildMaintenancePublishEntries(planFile.content, loginName, mode);
  const selectedEntries = entries.filter((entry) => selectedIds.includes(entry.id));
  if (selectedEntries.length === 0) {
    response.redirect(`/jobs/${job.id}/maintenance-review?mode=${mode}&notice=${encodeURIComponent("None of the selected maintenance entries were available for publishing.")}`);
    return;
  }

  const bot = await createCommonsBot({
    apiUrl: config.commonsApiUrl,
    userAgent: config.userAgent,
    credentials: { name: loginName, botPassword }
  });

  for (const entry of selectedEntries) {
    let currentContent: string | null = null;
    try {
      const page = await bot.readPage(entry.liveTargetTitle);
      currentContent = page.content;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("Page does not exist:")) {
        throw error;
      }
    }

    const nextContent = applyMaintenancePublishEntry(currentContent, entry);
    await bot.savePage(entry.targetTitle, nextContent, entry.editSummary);
    if (jobStore.get(job.id)) {
      jobStore.appendMessage(job.id, `Published ${entry.label} to ${entry.targetTitle}`);
    }
  }

  response.redirect(`/jobs/${job.id}/maintenance-review?mode=${mode}&notice=${encodeURIComponent(`Published ${selectedEntries.length} maintenance item(s) to ${mode}.`)}`);
}

export async function publishJobOutputs(request: Request, response: Response) {
  const job = await getJobSnapshot(getRouteId(request.params.id));
  if (!job) {
    response.status(404).send("Job not found");
    return;
  }

  if (job.action !== "create-voting" && job.action !== "process-challenge") {
    response.redirect(`/jobs/${job.id}/result?notice=${encodeURIComponent("This workflow does not support Web publishing yet.")}`);
    return;
  }

  const body = request.body as Record<string, unknown>;
  const mode = getReviewMode(body.mode ?? request.query.mode, job);
  const loginName = resolveLoginName(job);
  const botPassword = await resolveBotPassword(loginName);

  if (!loginName || !botPassword) {
    response.redirect(`/jobs/${job.id}/publish-review?mode=${mode}&notice=${encodeURIComponent("A saved BotPassword is required before Web publish can proceed.")}`);
    return;
  }

  const generatedFiles = await loadGeneratedFiles(job.id);
  const artifacts = buildPublishableArtifacts({ ...job, loginName }, generatedFiles, mode);
  if (artifacts.length === 0) {
    response.redirect(`/jobs/${job.id}/publish-review?mode=${mode}&notice=${encodeURIComponent("No publishable generated files were found for this job.")}`);
    return;
  }

  const bot = await createCommonsBot({
    apiUrl: config.commonsApiUrl,
    userAgent: config.userAgent,
    credentials: { name: loginName, botPassword }
  });

  for (const artifact of artifacts) {
    await bot.savePage(artifact.targetTitle, artifact.content, buildPublishSummary(job, artifact));
    if (jobStore.get(job.id)) {
      jobStore.appendMessage(job.id, `Published ${artifact.label} to ${artifact.targetTitle}`);
    }
  }

  response.redirect(`/jobs/${job.id}/result?notice=${encodeURIComponent(`Published ${artifacts.length} page(s) to ${mode}.`)}`);
}

export async function renderArtifactPreview(request: Request, response: Response) {
  const jobId = getRouteId(request.params.id);
  const job = await getJobSnapshot(jobId);
  if (!job) {
    response.status(404).send("Job not found");
    return;
  }

  const kind = getArtifactKind(request.params.kind);
  const fileName = getArtifactName(request.params.fileName);
  if (!kind || !fileName) {
    response.status(400).send("Invalid artifact path");
    return;
  }

  const artifactPath = resolveArtifactPath(jobId, kind, fileName);
  if (!artifactPath) {
    response.status(404).send("Artifact not found");
    return;
  }

  const content = await readFile(artifactPath, "utf8");
  const coreArtifacts = kind === "generated" ? await loadCoreArtifacts(job.id, job.action, fileName) : [];

  response.render("artifact-preview", {
    title: `${fileName} preview`,
    job,
    fileName,
    kind,
    content,
    coreArtifacts,
    downloadUrl: `/jobs/${job.id}/artifacts/${kind}/${encodeURIComponent(fileName)}/download`
  });
}

export async function downloadArtifact(request: Request, response: Response) {
  const jobId = getRouteId(request.params.id);
  const job = await getJobSnapshot(jobId);
  if (!job) {
    response.status(404).send("Job not found");
    return;
  }

  const kind = getArtifactKind(request.params.kind);
  const fileName = getArtifactName(request.params.fileName);
  if (!kind || !fileName) {
    response.status(400).send("Invalid artifact path");
    return;
  }

  const artifactPath = resolveArtifactPath(jobId, kind, fileName);
  if (!artifactPath) {
    response.status(404).send("Artifact not found");
    return;
  }

  response.download(artifactPath, fileName);
}

async function loadMaintenancePublishReview(
  job: JobProgress,
  mode: MaintenancePublishMode,
  selectedIds: string[]
): Promise<{
  overview: ({ previewUrl: string; downloadUrl: string } & ReturnType<typeof summarizeMaintenanceArtifact>) | null;
  entries: MaintenancePublishReviewEntry[];
  warning: string | null;
  canPublish: boolean;
}> {
  const generatedFiles = await loadGeneratedFiles(job.id);
  const overviewFile = generatedFiles.find((artifact) => artifact.name.endsWith("_maintenance_plan.json")) ?? null;
  const overview = overviewFile
    ? summarizeMaintenanceArtifact(overviewFile.name, overviewFile.content)
    : null;

  if (!overviewFile || !overview) {
    return {
      overview: null,
      entries: [],
      warning: "Maintenance plan JSON was not found for this job.",
      canPublish: false
    };
  }

  const loginName = resolveLoginName(job);
  const entries = buildMaintenancePublishEntries(overviewFile.content, loginName, mode);
  if (entries.length === 0) {
    return {
      overview: {
        ...overview,
        previewUrl: `/jobs/${job.id}/artifacts/generated/${encodeURIComponent(overviewFile.name)}`,
        downloadUrl: `/jobs/${job.id}/artifacts/generated/${encodeURIComponent(overviewFile.name)}/download`
      },
      entries: [],
      warning: "No publishable maintenance entries were found in the maintenance plan.",
      canPublish: false
    };
  }

  const botPassword = await resolveBotPassword(loginName);
  if (!loginName || !botPassword) {
    return {
      overview: {
        ...overview,
        previewUrl: `/jobs/${job.id}/artifacts/generated/${encodeURIComponent(overviewFile.name)}`,
        downloadUrl: `/jobs/${job.id}/artifacts/generated/${encodeURIComponent(overviewFile.name)}/download`
      },
      entries: entries.map((entry) => ({
        ...entry,
        status: "changed",
        statusLabel: "Ready to publish",
        summary: `${entry.liveTargetTitle} -> ${entry.targetTitle}`,
        diffSummary: "Save a BotPassword on the home page to load live target content before publishing.",
        selected: selectedIds.length === 0 || selectedIds.includes(entry.id)
      })),
      warning: "A saved BotPassword is required to load live target content for maintenance review and publishing.",
      canPublish: false
    };
  }

  const bot = await createCommonsBot({
    apiUrl: config.commonsApiUrl,
    userAgent: config.userAgent,
    credentials: { name: loginName, botPassword }
  });

  const reviewEntries: MaintenancePublishReviewEntry[] = [];
  for (const entry of entries) {
    let currentContent: string | null = null;
    try {
      const page = await bot.readPage(entry.liveTargetTitle);
      currentContent = page.content;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("Page does not exist:")) {
        throw error;
      }
    }

    const nextContent = applyMaintenancePublishEntry(currentContent, entry);
    const diff = summarizePublishDiff(currentContent, nextContent);
    reviewEntries.push({
      ...entry,
      status: diff.status,
      statusLabel: diff.status === "new" ? "New target content" : diff.status === "same" ? "No changes" : "Changes detected",
      summary: `${entry.liveTargetTitle} -> ${entry.targetTitle}`,
      diffSummary: buildDiffSummaryText(diff),
      selected: selectedIds.length === 0 || selectedIds.includes(entry.id)
    });
  }

  return {
    overview: {
      ...overview,
      previewUrl: `/jobs/${job.id}/artifacts/generated/${encodeURIComponent(overviewFile.name)}`,
      downloadUrl: `/jobs/${job.id}/artifacts/generated/${encodeURIComponent(overviewFile.name)}/download`
    },
    entries: reviewEntries,
    warning: null,
    canPublish: true
  };
}

async function loadPublishReview(job: JobProgress, mode: "sandbox" | "live"): Promise<{ entries: PublishReviewEntry[]; warning: string | null }> {
  if (job.action !== "create-voting" && job.action !== "process-challenge") {
    return {
      entries: [],
      warning: "This workflow does not publish challenge pages yet, so Web publish review is not available."
    };
  }

  const loginName = resolveLoginName(job);
  if (!loginName) {
    return {
      entries: [],
      warning: "This job does not record a login name, so the publish target cannot be reconstructed. Re-run the job before using Web publish review."
    };
  }

  const generatedFiles = await loadGeneratedFiles(job.id);
  const artifacts = buildPublishableArtifacts({ ...job, loginName }, generatedFiles, mode);
  if (artifacts.length === 0) {
    return {
      entries: [],
      warning: "No publishable generated files were found for this job."
    };
  }

  const botPassword = await resolveBotPassword(loginName);
  if (!botPassword) {
    return {
      entries: toReviewEntries(job.id, artifacts, new Map()),
      warning: "A saved BotPassword is required to load the current target pages for diff review. Save the password on the home page, then reopen this screen."
    };
  }

  const bot = await createCommonsBot({
    apiUrl: config.commonsApiUrl,
    userAgent: config.userAgent,
    credentials: { name: loginName, botPassword }
  });

  const currentContents = new Map<string, string | null>();
  for (const artifact of artifacts) {
    try {
      const page = await bot.readPage(artifact.targetTitle);
      currentContents.set(artifact.fileName, page.content);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Page does not exist:")) {
        currentContents.set(artifact.fileName, null);
        continue;
      }
      throw error;
    }
  }

  return {
    entries: toReviewEntries(job.id, artifacts, currentContents),
    warning: null
  };
}

function toReviewEntries(
  jobId: string,
  artifacts: PublishableArtifact[],
  currentContents: Map<string, string | null>
): PublishReviewEntry[] {
  return artifacts.map((artifact) => {
    const summary = summarizePublishDiff(currentContents.get(artifact.fileName) ?? null, artifact.content);
    return {
      label: artifact.label,
      fileName: artifact.fileName,
      targetTitle: artifact.targetTitle,
      previewUrl: `/jobs/${jobId}/artifacts/generated/${encodeURIComponent(artifact.fileName)}`,
      downloadUrl: `/jobs/${jobId}/artifacts/generated/${encodeURIComponent(artifact.fileName)}/download`,
      status: summary.status,
      statusLabel: summary.status === "new" ? "New page" : summary.status === "same" ? "No changes" : "Changes detected",
      summary: buildDiffSummaryText(summary),
      firstDifferenceLine: summary.firstDifferenceLine,
      diffRows: summary.rows
    };
  });
}

function buildDiffSummaryText(summary: ReturnType<typeof summarizePublishDiff>): string {
  if (summary.status === "new") {
    return `This target page does not exist yet. ${summary.nextLineCount} line(s) will be created.`;
  }

  if (summary.status === "same") {
    return `The target page already matches this generated artifact (${summary.nextLineCount} line(s)).`;
  }

  return `${summary.changedLineCount} differing line(s) detected. Current: ${summary.currentLineCount} line(s). Generated: ${summary.nextLineCount} line(s).`;
}

function buildPublishSummary(job: JobProgress, artifact: PublishableArtifact): string {
  if (artifact.targetType === "voting") {
    return job.action === "process-challenge"
      ? "Photo Challenge bot: revise voting page after validation"
      : "Photo Challenge bot: create voting page";
  }

  if (artifact.targetType === "result") {
    return "Photo Challenge bot: create result page";
  }

  return "Photo Challenge bot: create winners page";
}

function resolveLoginName(job: JobProgress): string {
  return job.loginName || process.env.NAME?.trim() || "";
}

async function resolveBotPassword(loginName: string): Promise<string> {
  const saved = await getCredentialPassword(loginName);
  if (saved) return saved;
  if (process.env.NAME?.trim() === loginName) {
    return process.env.BOT_PASSWORD?.trim() ?? "";
  }
  return "";
}

async function loadGeneratedFiles(jobId: string): Promise<Array<{ name: string; content: string }>> {
  const paths = getJobOutputPaths(jobId);
  const names = await safeReadDir(paths.generatedDir);
  const files = await Promise.all(
    names.map(async (name) => ({
      name,
      content: await readFile(path.join(paths.generatedDir, name), "utf8")
    }))
  );
  return files;
}

async function loadCoreArtifacts(jobId: string, action: string, activeFileName?: string): Promise<CoreArtifactEntry[]> {
  const artifacts = await listArtifacts(jobId);
  const { coreArtifacts } = classifyGeneratedArtifacts(artifacts.generated, action);

  return coreArtifacts.map((artifact) => ({
    ...artifact,
    isActive: artifact.name === activeFileName
  }));
}

async function listArtifacts(jobId: string): Promise<{ generated: ArtifactEntry[]; logs: ArtifactEntry[] }> {
  const paths = getJobOutputPaths(jobId);
  const generated = await safeReadDir(paths.generatedDir);
  const logs = await safeReadDir(paths.logsDir);

  return {
    generated: generated.map((name) => toArtifactEntry(jobId, "generated", name)),
    logs: logs.map((name) => toArtifactEntry(jobId, "logs", name))
  };
}

function toArtifactEntry(jobId: string, kind: ArtifactKind, name: string): ArtifactEntry {
  const encodedName = encodeURIComponent(name);
  return {
    name,
    kind,
    previewUrl: `/jobs/${jobId}/artifacts/${kind}/${encodedName}`,
    downloadUrl: `/jobs/${jobId}/artifacts/${kind}/${encodedName}/download`
  };
}

function classifyGeneratedArtifacts(generated: ArtifactEntry[], action: string): {
  coreArtifacts: CoreArtifactEntry[];
  otherGeneratedFiles: ArtifactEntry[];
} {
  const definitions = workflowArtifactDefinitions[action] ?? [];
  const usedNames = new Set<string>();
  const coreArtifacts = definitions.flatMap((definition) => {
    const match = generated.find((artifact) => artifact.name.endsWith(definition.suffix));
    if (!match) {
      return [];
    }

    usedNames.add(match.name);
    return [
      {
        ...match,
        type: definition.type,
        label: definition.label,
        description: definition.description
      }
    ];
  });

  return {
    coreArtifacts,
    otherGeneratedFiles: generated.filter((artifact) => !usedNames.has(artifact.name))
  };
}

function resolveArtifactPath(jobId: string, kind: ArtifactKind, fileName: string): string | null {
  const paths = getJobOutputPaths(jobId);
  const baseDir = kind === "generated" ? paths.generatedDir : paths.logsDir;
  const resolved = path.resolve(baseDir, fileName);
  const root = path.resolve(baseDir);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    return null;
  }
  return resolved;
}

async function safeReadDir(targetPath: string): Promise<string[]> {
  try {
    return await readdir(targetPath);
  } catch {
    return [];
  }
}












