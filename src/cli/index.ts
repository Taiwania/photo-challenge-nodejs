import { config } from "../infra/config.js";
import { jobStore } from "../infra/job-store.js";
import type { JobRequest, PublishMode } from "../core/models.js";
import { runJob } from "../workflows/run-job.js";
import { createCommonsBot } from "../services/commons-bot.js";
import { parseSubmittedChallenges } from "../parsers/submitting-parser.js";
import { parseVotingChallenges } from "../parsers/voting-parser.js";

type JobCommand = "create-voting" | "process-challenge" | "archive-pages" | "build-voting-index";
type ListCommand = "list-submitted-challenges" | "list-voting-challenges";
type CliCommand = JobCommand | ListCommand;

type CliLogger = {
  log: (message: string) => void;
  error: (message: string) => void;
};

type ParsedCliArgs =
  | { kind: "help" }
  | { kind: "list"; action: ListCommand; credentials: { name: string; botPassword: string }; source: "main" | "old" }
  | { kind: "run"; request: JobRequest };

const jobCommands = new Set<JobCommand>(["create-voting", "process-challenge", "archive-pages", "build-voting-index"]);
const listCommands = new Set<ListCommand>(["list-submitted-challenges", "list-voting-challenges"]);
const challengeRequiredCommands = new Set<CliCommand>(["create-voting", "process-challenge"]);
const VALID_PUBLISH_MODES = new Set<PublishMode>(["dry-run", "sandbox", "live"]);
const VALID_SOURCES = new Set<string>(["main", "old"]);

export function buildCliUsage(): string {
  return [
    "Photo Challenge CLI",
    "",
    "Commands:",
    "  list-submitted-challenges          List challenges from Commons:Photo challenge/Submitting[_old]",
    "  list-voting-challenges             List challenges from Commons:Photo challenge/Voting[_old]",
    "  archive-pages                      Copy Submitting→Submitting_old and Voting→Voting_old",
    "  build-voting-index                 Generate the new voting index section from Submitting[_old]",
    "  create-voting                      Build the voting page for a challenge",
    "  process-challenge                  Validate votes and generate result/winners pages",
    "",
    "Options:",
    "  --challenge       Challenge title (required for create-voting / process-challenge)",
    "  --source          main|old — which page variant to read (default: old for build-voting-index, main for list-*)",
    "  --name            BotPassword login name. Defaults to NAME from .env",
    "  --bot-password    BotPassword value. Defaults to BOT_PASSWORD from .env",
    "  --publish-mode    dry-run (default) | sandbox | live",
    "  --help            Show this help text",
    "",
    "Examples:",
    "  npm run cli -- list-submitted-challenges",
    "  npm run cli -- list-voting-challenges --source old",
    "  npm run cli -- archive-pages --publish-mode sandbox",
    "  npm run cli -- build-voting-index --publish-mode dry-run",
    "  npm run cli -- create-voting --challenge \"2026 - March - Three-wheelers\" --publish-mode sandbox",
    "  npm run cli -- process-challenge --challenge \"2026 - February - Orange\" --publish-mode sandbox"
  ].join("\n");
}

function parseOptions(rest: string[]): Map<string, string> {
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
  return options;
}

export function parseCliArgs(args: string[], env: NodeJS.ProcessEnv = process.env): ParsedCliArgs {
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    return { kind: "help" };
  }

  const [command, ...rest] = args;
  const isJobCmd = jobCommands.has(command as JobCommand);
  const isListCmd = listCommands.has(command as ListCommand);

  if (!isJobCmd && !isListCmd) {
    throw new Error(`Unknown command: ${command}`);
  }

  const options = parseOptions(rest);
  const name = options.get("name")?.trim() ?? env.NAME?.trim() ?? "";
  const botPassword = options.get("bot-password")?.trim() ?? env.BOT_PASSWORD?.trim() ?? "";

  if (!name) throw new Error("Missing login name. Use --name or set NAME in .env.");
  if (!botPassword) throw new Error("Missing bot password. Use --bot-password or set BOT_PASSWORD in .env.");

  if (isListCmd) {
    const rawSource = options.get("source")?.trim() ?? "main";
    if (!VALID_SOURCES.has(rawSource)) {
      throw new Error(`Invalid --source "${rawSource}". Must be main or old.`);
    }
    return {
      kind: "list",
      action: command as ListCommand,
      credentials: { name, botPassword },
      source: rawSource as "main" | "old"
    };
  }

  // Job commands
  const challenge = options.get("challenge")?.trim() ?? "";
  const rawPublishMode = options.get("publish-mode")?.trim() ?? "dry-run";
  const rawSource = options.get("source")?.trim() ?? "old";

  if (challengeRequiredCommands.has(command as CliCommand) && !challenge) {
    throw new Error("Missing required --challenge value.");
  }
  if (!VALID_PUBLISH_MODES.has(rawPublishMode as PublishMode)) {
    throw new Error(`Invalid --publish-mode "${rawPublishMode}". Must be dry-run, sandbox, or live.`);
  }
  if (!VALID_SOURCES.has(rawSource)) {
    throw new Error(`Invalid --source "${rawSource}". Must be main or old.`);
  }

  return {
    kind: "run",
    request: {
      action: command,
      challenge,
      source: rawSource as "main" | "old",
      credentials: { name, botPassword },
      publishMode: rawPublishMode as PublishMode
    }
  };
}

async function runListCommand(
  parsed: Extract<ParsedCliArgs, { kind: "list" }>,
  logger: CliLogger
): Promise<void> {
  const bot = await createCommonsBot({
    apiUrl: config.commonsApiUrl,
    userAgent: config.userAgent,
    credentials: parsed.credentials
  });

  if (parsed.action === "list-submitted-challenges") {
    const pageTitle = parsed.source === "old"
      ? "Commons:Photo challenge/Submitting_old"
      : "Commons:Photo challenge/Submitting";
    logger.log(`Reading ${pageTitle}…`);
    const page = await bot.readPage(pageTitle);
    const challenges = parseSubmittedChallenges(page.content);
    logger.log(`Found ${challenges.length} challenge(s):`);
    for (const c of challenges) logger.log(`  ${c.raw}`);
  } else {
    const pageTitle = parsed.source === "old"
      ? "Commons:Photo challenge/Voting_old"
      : "Commons:Photo challenge/Voting";
    logger.log(`Reading ${pageTitle}…`);
    const page = await bot.readPage(pageTitle);
    const challenges = parseVotingChallenges(page.content);
    logger.log(`Found ${challenges.length} challenge(s):`);
    for (const c of challenges) logger.log(`  ${c.raw}`);
  }
}

export async function runCli(args: string[] = process.argv.slice(2), logger: CliLogger = console): Promise<number> {
  try {
    const parsed = parseCliArgs(args);

    if (parsed.kind === "help") {
      logger.log(buildCliUsage());
      return 0;
    }

    if (parsed.kind === "list") {
      await runListCommand(parsed, logger);
      return 0;
    }

    const job = jobStore.create(parsed.request, config.outputRoot);
    logger.log(`Started job ${job.id}`);
    logger.log(`Action:       ${parsed.request.action}`);
    if (parsed.request.challenge) logger.log(`Challenge:    ${parsed.request.challenge}`);
    logger.log(`Publish mode: ${parsed.request.publishMode}`);
    logger.log(`Output root:  ${job.outputDir}`);

    await runJob(job.id, parsed.request);

    const finalJob = jobStore.get(job.id);
    if (!finalJob) throw new Error(`CLI job disappeared: ${job.id}`);

    if (finalJob.status === "failed") {
      logger.error(finalJob.errorMessage ?? "Job failed.");
      return 1;
    }

    logger.log(`Completed job ${job.id}`);
    logger.log(`Artifacts:    ${finalJob.outputDir}`);
    return 0;
  } catch (error) {
    logger.error(error instanceof Error ? error.message : "Unknown CLI error");
    logger.log("");
    logger.log(buildCliUsage());
    return 1;
  }
}
