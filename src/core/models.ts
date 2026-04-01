export type JobStatus = "queued" | "running" | "failed" | "completed";

export type BotCredentials = {
  name: string;
  botPassword: string;
};

export type JobRequest = {
  action: string;
  challenge: string;
  credentials: BotCredentials;
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
  errorMessage: string | null;
};
