import { config } from "../infra/config.js";
import { jobStore } from "../infra/job-store.js";
import type { JobRequest } from "../core/models.js";
import { runJob } from "../workflows/run-job.js";

type CliCommand = "create-voting" | "process-challenge";

type CliLogger = {
  log: (message: string) => void;
  error: (message: string) => void;
};

type ParsedCliArgs =
  | { kind: "help" }
  | { kind: "run"; request: JobRequest };

const validCommands = new Set<CliCommand>(["create-voting", "process-challenge"]);

export function buildCliUsage(): string {
  return [
    "Photo Challenge CLI",
    "",
    "Usage:",
    "  npm run cli -- <create-voting|process-challenge> --challenge \"2026 - March - Three-wheelers\" [--name NAME] [--bot-password PASSWORD]",
    "",
    "Options:",
    "  --challenge       Challenge title, for example \"2026 - February - Orange\"",
    "  --name            BotPassword login name. Defaults to NAME from .env",
    "  --bot-password    BotPassword value. Defaults to BOT_PASSWORD from .env",
    "  --help            Show this help text",
    "",
    "Examples:",
    "  npm run cli -- create-voting --challenge \"2026 - March - Three-wheelers\"",
    "  npm run cli -- process-challenge --challenge \"2026 - February - Orange\""
  ].join("\n");
}

export function parseCliArgs(args: string[], env: NodeJS.ProcessEnv = process.env): ParsedCliArgs {
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    return { kind: "help" };
  }

  const [command, ...rest] = args;
  if (!validCommands.has(command as CliCommand)) {
    throw new Error(`Unknown command: ${command}`);
  }

  const options = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    options.set(key, value);
    index += 1;
  }

  const challenge = options.get("challenge")?.trim() ?? "";
  const name = options.get("name")?.trim() ?? env.NAME?.trim() ?? "";
  const botPassword = options.get("bot-password")?.trim() ?? env.BOT_PASSWORD?.trim() ?? "";

  if (!challenge) {
    throw new Error("Missing required --challenge value.");
  }
  if (!name) {
    throw new Error("Missing login name. Use --name or set NAME in .env.");
  }
  if (!botPassword) {
    throw new Error("Missing bot password. Use --bot-password or set BOT_PASSWORD in .env.");
  }

  return {
    kind: "run",
    request: {
      action: command,
      challenge,
      credentials: {
        name,
        botPassword
      }
    }
  };
}

export async function runCli(args: string[] = process.argv.slice(2), logger: CliLogger = console): Promise<number> {
  try {
    const parsed = parseCliArgs(args);
    if (parsed.kind === "help") {
      logger.log(buildCliUsage());
      return 0;
    }

    const job = jobStore.create(parsed.request, config.outputRoot);
    logger.log(`Started job ${job.id}`);
    logger.log(`Action: ${parsed.request.action}`);
    logger.log(`Challenge: ${parsed.request.challenge}`);
    logger.log(`Output root: ${job.outputDir}`);

    await runJob(job.id, parsed.request);

    const finalJob = jobStore.get(job.id);
    if (!finalJob) {
      throw new Error(`CLI job disappeared: ${job.id}`);
    }

    if (finalJob.status === "failed") {
      logger.error(finalJob.errorMessage ?? "Job failed.");
      return 1;
    }

    logger.log(`Completed job ${job.id}`);
    logger.log(`Artifacts: ${finalJob.outputDir}\\${job.id}`);
    return 0;
  } catch (error) {
    logger.error(error instanceof Error ? error.message : "Unknown CLI error");
    logger.log("");
    logger.log(buildCliUsage());
    return 1;
  }
}
