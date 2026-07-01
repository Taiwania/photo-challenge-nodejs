import { config } from "../infra/config.js";
import { jobStore } from "../infra/job-store.js";
import type { JobRequest, ListAction, SourcePageVariant } from "../core/models.js";
import {
  buildValidatedJobRequest,
  isJobAction,
  isListAction,
  parseSourcePageVariant,
  parseSubmissionWindowValues
} from "../core/job-actions.js";
import { runJob } from "../workflows/run-job.js";
import { createCommonsBot } from "../services/commons-bot.js";
import { parseSubmittedChallenges } from "../parsers/submitting-parser.js";
import { parseVotingChallenges } from "../parsers/voting-parser.js";

type CliLogger = {
  log: (message: string) => void;
  error: (message: string) => void;
};

type ParsedCliArgs =
  | { kind: "help" }
  | { kind: "list"; action: ListAction; credentials: { name: string; botPassword: string }; source: SourcePageVariant }
  | { kind: "run"; request: JobRequest };

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
    "  count-votes-and-select-winners     Count votes, score entries, and generate result/winners pages",
    "  post-results-maintenance           Plan maintenance and optionally publish winner notifications/file assessments",
    "",
    "Options:",
    "  --challenge         Challenge title (required for create-voting / count-votes-and-select-winners / post-results-maintenance)",
    "  --paired-challenge  Second challenge used for shared winner announcements and Previous-page updates",
    "  --entry-mode        single (default) | duo-coequal | duo-reference",
    "  --submission-start  Exceptional duration override: ISO date/time, inclusive. Use with --submission-end",
    "  --submission-end    Exceptional duration override: ISO date/time, exclusive. Use with --submission-start",
    "  --source            main|old — which page variant to read (default: old for build-voting-index, main for list-*)",
    "  --name              BotPassword login name. Defaults to NAME from .env",
    "  --bot-password      BotPassword value. Defaults to BOT_PASSWORD from .env",
    "  --publish-mode      dry-run (default) | sandbox | live",
    "  --help              Show this help text",
    "",
    "Examples:",
    "  npm run cli -- list-submitted-challenges",
    "  npm run cli -- list-voting-challenges --source old",
    "  npm run cli -- archive-pages --publish-mode live",
    "  npm run cli -- build-voting-index --publish-mode dry-run",
    "  npm run cli -- create-voting --challenge \"2026 - March - Three-wheelers\" --publish-mode sandbox",
    "  npm run cli -- count-votes-and-select-winners --challenge \"2026 - February - Orange\" --publish-mode sandbox",
    "  npm run cli -- post-results-maintenance --challenge \"2026 - February - Orange\" --paired-challenge \"2026 - February - First aid\" --publish-mode dry-run",
    "  npm run cli -- post-results-maintenance --challenge \"2026 - February - Orange\" --publish-mode live"
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

function parseSubmissionWindow(options: Map<string, string>) {
  const startsAt = options.get("submission-start")?.trim() ?? "";
  const endsAt = options.get("submission-end")?.trim() ?? "";
  return parseSubmissionWindowValues(startsAt, endsAt, {
    partial: "--submission-start and --submission-end must be provided together.",
    invalid: "Invalid submission window. Use ISO date/times with --submission-start earlier than --submission-end."
  });
}

export function parseCliArgs(args: string[], env: NodeJS.ProcessEnv = process.env): ParsedCliArgs {
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    return { kind: "help" };
  }

  const [command, ...rest] = args;
  const isJobCmd = isJobAction(command);
  const isListCmd = isListAction(command);

  if (!isJobCmd && !isListCmd) {
    throw new Error(`Unknown command: ${command}`);
  }

  const options = parseOptions(rest);
  const name = options.get("name")?.trim() ?? env.NAME?.trim() ?? "";
  const botPassword = options.get("bot-password")?.trim() ?? env.BOT_PASSWORD?.trim() ?? "";

  if (!name) throw new Error("Missing login name. Use --name or set NAME in .env.");
  if (!botPassword) throw new Error("Missing bot password. Use --bot-password or set BOT_PASSWORD in .env.");

  if (isListCmd) {
    return {
      kind: "list",
      action: command,
      credentials: { name, botPassword },
      source: parseSourcePageVariant(options.get("source")?.trim() ?? "main")
    };
  }

  const submissionWindow = parseSubmissionWindow(options);

  return {
    kind: "run",
    request: buildValidatedJobRequest({
      action: command,
      challenge: options.get("challenge") ?? "",
      pairedChallenge: options.get("paired-challenge"),
      entryMode: options.get("entry-mode"),
      submissionWindow,
      source: options.get("source"),
      credentials: { name, botPassword },
      publishMode: options.get("publish-mode")
    })
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
    if (parsed.request.pairedChallenge) logger.log(`Paired:       ${parsed.request.pairedChallenge}`);
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
