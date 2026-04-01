import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import type { Request, Response } from "express";
import type { JobProgress, JobRequest } from "../../core/models.js";
import { getCredentialPassword, rememberCredential } from "../../infra/credential-store.js";
import { loadPersistedJob } from "../../infra/job-history.js";
import { jobStore } from "../../infra/job-store.js";
import { getJobOutputPaths } from "../../infra/output-paths.js";
import { runJob } from "../../workflows/run-job.js";
import { buildHomePageViewModel } from "./home-controller.js";

type ArtifactKind = "generated" | "logs";

type ArtifactEntry = {
  name: string;
  kind: ArtifactKind;
  previewUrl: string;
  downloadUrl: string;
};

type CoreArtifactType = "voting" | "result" | "winners" | "revised";

type CoreArtifactEntry = ArtifactEntry & {
  type: CoreArtifactType;
  label: string;
  description: string;
  isActive?: boolean;
};

const coreArtifactDefinitions: Array<{
  type: CoreArtifactType;
  suffix: string;
  label: string;
  description: string;
}> = [
  {
    type: "voting",
    suffix: "_voting.txt",
    label: "Voting Page",
    description: "Preview the generated voting page wikitext."
  },
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
];

function buildJobRequest(body: Record<string, unknown>): JobRequest {
  return {
    action: String(body.action ?? "process-challenge"),
    challenge: String(body.challenge ?? "").trim(),
    credentials: {
      name: String(body.name ?? "").trim(),
      botPassword: String(body.botPassword ?? "")
    }
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

function formatActionLabel(action: string): string {
  if (action === "create-voting") {
    return "Prepare voting page";
  }

  if (action === "process-challenge") {
    return "Count votes and publish results";
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
          action: jobRequest.action
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

  const coreArtifacts = job.status === "completed" ? await loadCoreArtifacts(job.id) : [];

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
  const { coreArtifacts, otherGeneratedFiles } = classifyGeneratedArtifacts(artifacts.generated);

  response.render("result", {
    title: `Result ${job.id}`,
    job,
    jobActionLabel: formatActionLabel(job.action),
    coreArtifacts,
    generatedFiles: otherGeneratedFiles,
    logFiles: artifacts.logs
  });
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
  const coreArtifacts = kind === "generated" ? await loadCoreArtifacts(job.id, fileName) : [];

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

async function loadCoreArtifacts(jobId: string, activeFileName?: string): Promise<CoreArtifactEntry[]> {
  const artifacts = await listArtifacts(jobId);
  const { coreArtifacts } = classifyGeneratedArtifacts(artifacts.generated);

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

function classifyGeneratedArtifacts(generated: ArtifactEntry[]): {
  coreArtifacts: CoreArtifactEntry[];
  otherGeneratedFiles: ArtifactEntry[];
} {
  const usedNames = new Set<string>();
  const coreArtifacts = coreArtifactDefinitions.flatMap((definition) => {
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
