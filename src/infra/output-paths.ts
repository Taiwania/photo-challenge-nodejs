import path from "node:path";
import { mkdir } from "node:fs/promises";
import { config } from "./config.js";

export type JobOutputPaths = {
  jobRoot: string;
  inputDir: string;
  generatedDir: string;
  logsDir: string;
};

export function getJobOutputPaths(jobId: string): JobOutputPaths {
  const jobRoot = path.join(config.outputRoot, jobId);
  return {
    jobRoot,
    inputDir: path.join(jobRoot, "input"),
    generatedDir: path.join(jobRoot, "generated"),
    logsDir: path.join(jobRoot, "logs")
  };
}

export async function ensureJobOutputPaths(jobId: string): Promise<JobOutputPaths> {
  const paths = getJobOutputPaths(jobId);
  await mkdir(paths.inputDir, { recursive: true });
  await mkdir(paths.generatedDir, { recursive: true });
  await mkdir(paths.logsDir, { recursive: true });
  return paths;
}
