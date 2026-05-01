import type { Request, Response } from "express";
import { clearSavedCredential, getCredentialStoreStatus, getSavedName } from "../../infra/credential-store.js";
import { listPersistedJobs } from "../../infra/job-history.js";
import { jobStore } from "../../infra/job-store.js";

type HomeDefaults = {
  name: string;
  challenge: string;
  pairedChallenge: string;
  action: string;
  publishMode: string;
};

type HomePageOptions = {
  error?: string;
  success?: string;
  defaults?: Partial<HomeDefaults>;
};

type HomeRecentJob = {
  id: string;
  action: string;
  challenge: string;
  currentStep: string;
  finishedAtLabel: string;
  progressUrl: string;
  resultUrl: string;
  statusLabel?: string;
  statusClass?: string;
  timestampLabel?: string;
};

export async function renderHomePage(request: Request, response: Response) {
  const success = request.query.credentialCleared === "1" ? "Saved sign-in was cleared from this machine." : undefined;
  response.render("home", await buildHomePageViewModel({ success }));
}

export async function clearSavedCredentialAction(request: Request, response: Response) {
  const body = request.body as Record<string, unknown>;
  await clearSavedCredential(String(body.name ?? "").trim());
  response.redirect("/?credentialCleared=1");
}

export async function buildHomePageViewModel(options: HomePageOptions = {}) {
  const savedName = await getSavedName();
  const credentialStore = getCredentialStoreStatus();
  const recentJobs = await getRecentJobs();

  return {
    title: "Photo Challenge Runner",
    error: options.error,
    success: options.success,
    defaults: {
      name: options.defaults?.name ?? savedName ?? process.env.NAME ?? "",
      challenge: options.defaults?.challenge ?? "",
      pairedChallenge: options.defaults?.pairedChallenge ?? "",
      action: options.defaults?.action ?? "process-challenge",
      publishMode: options.defaults?.publishMode ?? "dry-run"
    },
    savedCredential: savedName
      ? {
          name: savedName,
          backendLabel: credentialStore.backendLabel,
          canPersistAcrossRestarts: credentialStore.canPersistAcrossRestarts
        }
      : null,
    credentialStore,
    recentCompletedJob: recentJobs.find((job) => job.statusLabel === "completed") ?? null,
    recentJobs
  };
}

async function getRecentJobs(): Promise<HomeRecentJob[]> {
  const inMemoryJobs = jobStore.listByStatus().slice().reverse().map((job) => ({
    id: job.id,
    action: formatActionLabel(job.action),
    challenge: job.challenge,
    currentStep: job.currentStep,
    finishedAtLabel: formatTimestamp(job.finishedAt),
    progressUrl: `/jobs/${job.id}`,
    resultUrl: `/jobs/${job.id}/result`,
    statusLabel: job.status,
    statusClass: `status-${job.status}`,
    timestampLabel: getTimestampLabel(job),
    finishedAt: job.finishedAt?.getTime() ?? 0
  }));

  const persistedJobs = (await listPersistedJobs(10)).map((job) => ({
    id: job.id,
    action: formatActionLabel(job.action),
    challenge: job.challenge,
    currentStep: job.currentStep,
    finishedAtLabel: formatTimestamp(job.finishedAt),
    progressUrl: `/jobs/${job.id}`,
    resultUrl: `/jobs/${job.id}/result`,
    statusLabel: job.status,
    statusClass: `status-${job.status}`,
    timestampLabel: getTimestampLabel(job),
    finishedAt: job.finishedAt?.getTime() ?? 0
  }));

  const merged = [...inMemoryJobs, ...persistedJobs]
    .filter((job, index, array) => array.findIndex((candidate) => candidate.id === job.id) === index)
    .sort((left, right) => right.finishedAt - left.finishedAt)
    .slice(0, 3)
    .map(({ finishedAt, ...job }) => job);

  return merged;
}

function formatActionLabel(action: string): string {
  if (action === "create-voting") {
    return "Prepare voting page";
  }

  if (action === "process-challenge") {
    return "Count votes and publish results";
  }

  if (action === "post-results-maintenance") {
    return "Run post-results maintenance";
  }

  return action;
}

function getTimestampLabel(job: { startedAt?: Date | null; finishedAt: Date | null }) {
  if (job.finishedAt) {
    return `Updated ${formatTimestamp(job.finishedAt)}`;
  }

  if (job.startedAt) {
    return `Started ${formatTimestamp(job.startedAt)}`;
  }

  return "Waiting to start";
}

function formatTimestamp(value: Date | null): string {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}
