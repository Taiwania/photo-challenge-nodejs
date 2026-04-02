export type JobStatus = "queued" | "running" | "failed" | "completed";

export type PublishMode = "dry-run" | "sandbox" | "live";

export type BotCredentials = {
  name: string;
  botPassword: string;
};

export type JobRequest = {
  action: string;
  challenge: string;
  /** "main" reads the live page; "old" reads the *_old archived copy. Applies to list-* and build-voting-index. */
  source?: "main" | "old";
  credentials: BotCredentials;
  publishMode: PublishMode;
};

export type JobProgress = {
  id: string;
  status: JobStatus;
  currentStep: string;
  percent: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  messages: string[];
  outputDir: string;
  action: string;
  challenge: string;
  publishMode: PublishMode;
  errorMessage: string | null;
};
