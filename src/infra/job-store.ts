import { randomUUID } from "node:crypto";
import type { JobProgress, JobRequest, JobStatus } from "../core/models.js";

export class JobStore {
  private readonly jobs = new Map<string, JobProgress>();

  create(request: JobRequest, outputDir: string): JobProgress {
    const id = randomUUID();
    const job: JobProgress = {
      id,
      status: "queued",
      currentStep: "Waiting to start",
      percent: 0,
      startedAt: null,
      finishedAt: null,
      messages: [`Job created for action "${request.action}".`],
      outputDir,
      action: request.action,
      challenge: request.challenge,
      publishMode: request.publishMode,
      loginName: request.credentials.name,
      errorMessage: null
    };

    this.jobs.set(id, job);
    return job;
  }

  get(id: string): JobProgress | undefined {
    return this.jobs.get(id);
  }

  update(id: string, patch: Partial<JobProgress>): JobProgress {
    const job = this.jobs.get(id);
    if (!job) {
      throw new Error(`Unknown job: ${id}`);
    }

    const nextJob = { ...job, ...patch };
    this.jobs.set(id, nextJob);
    return nextJob;
  }

  appendMessage(id: string, message: string): JobProgress {
    const job = this.jobs.get(id);
    if (!job) {
      throw new Error(`Unknown job: ${id}`);
    }

    const nextJob = { ...job, messages: [...job.messages, message] };
    this.jobs.set(id, nextJob);
    return nextJob;
  }

  markRunning(id: string, currentStep: string, percent: number): JobProgress {
    return this.update(id, {
      status: "running",
      startedAt: this.jobs.get(id)?.startedAt ?? new Date(),
      currentStep,
      percent
    });
  }

  markCompleted(id: string, currentStep = "Completed", percent = 100): JobProgress {
    return this.update(id, {
      status: "completed",
      currentStep,
      percent,
      finishedAt: new Date()
    });
  }

  markFailed(id: string, errorMessage: string): JobProgress {
    return this.update(id, {
      status: "failed",
      currentStep: "Failed",
      errorMessage,
      finishedAt: new Date()
    });
  }

  listByStatus(status?: JobStatus): JobProgress[] {
    const jobs = [...this.jobs.values()];
    return status ? jobs.filter((job) => job.status === status) : jobs;
  }
}

export const jobStore = new JobStore();
