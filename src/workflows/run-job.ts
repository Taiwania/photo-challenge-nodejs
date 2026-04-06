import path from "node:path";
import { writeFile } from "node:fs/promises";
import { DateTime } from "luxon";
import type { JobRequest, PublishMode } from "../core/models.js";
import { countVotes, type ScoredVotingFile } from "../core/scoring.js";
import { listErrors, validateVotes, type VoteWithError, type VoterValidation } from "../core/validation.js";
import { validateVoters } from "../core/voters.js";
import {
  extractPrefixIndexPrefix,
  parseSubmittedChallenges,
  parseSubmissionPage,
  type SubmissionEntry
} from "../parsers/submitting-parser.js";
import { parseVotingChallenges, parseVotingPage, type VotingFile } from "../parsers/voting-parser.js";
import { renderResultPage } from "../renderers/result-page.js";
import { reviseVotingPage } from "../renderers/revised-voting-page.js";
import { renderVotingPage, type VotingSubmissionEntry } from "../renderers/voting-page.js";
import { renderWinnersPage } from "../renderers/winners-page.js";
import { extractChallengeCode, renderVotingIndexSection, type VotingIndexEntry } from "../renderers/voting-index.js";
import { config } from "../infra/config.js";
import { ensureJobOutputPaths, getJobOutputPaths } from "../infra/output-paths.js";
import { jobStore } from "../infra/job-store.js";
import { createCommonsBot, type CommonsBot, type FileInfoLookup, type ReadPageResult } from "../services/commons-bot.js";

type ProgressStep = {
  percent: number;
  step: string;
  message: string;
};

type SourceSpec = {
  label: string;
  title: string;
  fileName: string;
};

type EnrichedSubmissionEntry = SubmissionEntry & VotingSubmissionEntry;

type ParsedArtifacts = {
  summaryLines: string[];
  files: Array<Record<string, unknown>>;
  votes: Array<Record<string, unknown>>;
  challenges: Array<Record<string, unknown>>;
};

function slugify(value: string): string {
  return value
    .trim()
    .replace(/[^\w\- ]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "challenge";
}

function getVoteDeadline(challenge: string): DateTime {
  const [year, monthName] = challenge.split(" - ");
  const challengeStart = DateTime.fromFormat(`1 ${monthName} ${year}`, "d MMMM yyyy", { zone: "utc" });
  return challengeStart.plus({ months: 2 }).startOf("month");
}

export async function runJob(jobId: string, request: JobRequest): Promise<void> {
  let paths: Awaited<ReturnType<typeof ensureJobOutputPaths>> | null = null;

  try {
    paths = await ensureJobOutputPaths(jobId);
    const challengeSlug = slugify(request.challenge);
    const timestamp = DateTime.now().toUTC().toISO();

    enforcePublishModePolicy(request);

    updateProgress(jobId, {
      percent: 10,
      step: "Initializing bot session",
      message: "Logging into Wikimedia Commons with mwn."
    });

    const bot = await createCommonsBot({
      apiUrl: config.commonsApiUrl,
      userAgent: config.userAgent,
      credentials: request.credentials
    });

    const currentUser = await bot.getCurrentUser();
    jobStore.appendMessage(jobId, `Logged in as ${currentUser ?? "unknown user"}.`);

    if (request.action === "archive-pages") {
      await runArchivePages(bot, paths, jobId, request);
      await finalizeJob(paths.logsDir, jobId, request, currentUser, timestamp, 2, 0, 0, 0);
      jobStore.appendMessage(jobId, `Artifacts written to ${getJobOutputPaths(jobId).jobRoot}`);
      jobStore.markCompleted(jobId);
      return;
    }

    if (request.action === "build-voting-index") {
      const section = await runBuildVotingIndex(bot, paths, jobId, request);
      await writeFile(path.join(paths.generatedDir, "voting_index_section.txt"), section, "utf8");
      await finalizeJob(paths.logsDir, jobId, request, currentUser, timestamp, 1, 0, 0, 0);
      jobStore.appendMessage(jobId, `Voting index section written to ${getJobOutputPaths(jobId).jobRoot}`);
      jobStore.markCompleted(jobId);
      return;
    }

    const sourceSpecs = getSourceSpecs(request);
    const sources: ReadPageResult[] = [];

    for (let index = 0; index < sourceSpecs.length; index += 1) {
      const source = sourceSpecs[index];
      const percent = 25 + Math.round((index / Math.max(sourceSpecs.length, 1)) * 15);
      updateProgress(jobId, {
        percent,
        step: `Reading ${source.label}`,
        message: `Fetching ${source.title}`
      });

      const page = await bot.readPage(source.title);
      sources.push(page);
      await writeFile(path.join(paths.inputDir, source.fileName), page.content, "utf8");
    }

    if (request.action === "create-voting") {
      await enrichCreateVotingSources(bot, request, sources, paths.inputDir, jobId);
      const submissionEntries = await handleCreateVoting(bot, request, sources, paths.inputDir, jobId);
      const parsed = parseCreateVotingArtifacts(request, sources, submissionEntries);
      await persistCommonArtifacts(paths.generatedDir, challengeSlug, sources, parsed);
      const renderedVotingPage = renderVotingPage(request.challenge, submissionEntries);
      await writeFile(path.join(paths.generatedDir, `${challengeSlug}_voting.txt`), renderedVotingPage.text, "utf8");
      jobStore.appendMessage(jobId, `Rendered voting page with ${renderedVotingPage.includedCount} entries and ${renderedVotingPage.issueCount} issues.`);

      updateProgress(jobId, { percent: 88, step: "Publishing pages", message: `Publish mode: ${request.publishMode}` });
      await publishPage(bot, jobId, request.credentials.name, request.challenge, "voting", renderedVotingPage.text, "Photo Challenge bot: create voting page", request.publishMode);

      await finalizeJob(paths.logsDir, jobId, request, currentUser, timestamp, sources.length, parsed.challenges.length, parsed.files.length, parsed.votes.length);
      jobStore.appendMessage(jobId, `Artifacts written to ${getJobOutputPaths(jobId).jobRoot}`);
      jobStore.markCompleted(jobId);
      return;
    }

    const processArtifacts = await handleProcessChallenge(bot, request, sources, challengeSlug, jobId);
    await persistCommonArtifacts(paths.generatedDir, challengeSlug, sources, processArtifacts.parsed);
    await writeFile(path.join(paths.generatedDir, `${challengeSlug}_revised.txt`), processArtifacts.revisedText, "utf8");
    await writeFile(path.join(paths.generatedDir, `${challengeSlug}_result.txt`), processArtifacts.resultText, "utf8");
    await writeFile(path.join(paths.generatedDir, `${challengeSlug}_winners.txt`), processArtifacts.winnersText, "utf8");

    updateProgress(jobId, { percent: 88, step: "Publishing pages", message: `Publish mode: ${request.publishMode}` });
    await publishPage(bot, jobId, request.credentials.name, request.challenge, "voting", processArtifacts.revisedText, "Photo Challenge bot: revise voting page after validation", request.publishMode);
    await publishPage(bot, jobId, request.credentials.name, request.challenge, "result", processArtifacts.resultText, "Photo Challenge bot: create result page", request.publishMode);
    await publishPage(bot, jobId, request.credentials.name, request.challenge, "winners", processArtifacts.winnersText, "Photo Challenge bot: create winners page", request.publishMode);

    await finalizeJob(
      paths.logsDir,
      jobId,
      request,
      currentUser,
      timestamp,
      sources.length,
      processArtifacts.parsed.challenges.length,
      processArtifacts.parsed.files.length,
      processArtifacts.parsed.votes.length
    );
    jobStore.appendMessage(jobId, `Artifacts written to ${getJobOutputPaths(jobId).jobRoot}`);
    jobStore.markCompleted(jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    jobStore.appendMessage(jobId, `Job failed: ${message}`);
    if (paths) {
      await persistFailedJob(paths.logsDir, jobId, request, message);
    }
    jobStore.markFailed(jobId, message);
  }
}

function enforcePublishModePolicy(request: JobRequest): void {
  if (request.action === "archive-pages" && request.publishMode === "sandbox") {
    throw new Error("archive-pages does not support sandbox publishing. Use dry-run or live.");
  }

  if (request.action === "build-voting-index" && request.publishMode !== "dry-run") {
    throw new Error("build-voting-index currently supports only --publish-mode dry-run to avoid overwriting the shared voting index.");
  }
}

async function handleCreateVoting(
  bot: CommonsBot,
  request: JobRequest,
  sources: ReadPageResult[],
  inputDir: string,
  jobId: string
): Promise<EnrichedSubmissionEntry[]> {
  updateProgress(jobId, {
    percent: 50,
    step: "Loading file metadata",
    message: "Looking up uploader, timestamp, dimensions, and own-work markers for submission files."
  });

  const submissionEntries = await loadSubmissionEntries(bot, request, sources, jobId);

  updateProgress(jobId, {
    percent: 65,
    step: "Parsing source content",
    message: "Running the first TypeScript parsers on live Commons content."
  });

  return submissionEntries;
}

async function handleProcessChallenge(
  bot: CommonsBot,
  request: JobRequest,
  sources: ReadPageResult[],
  challengeSlug: string,
  jobId: string
): Promise<{
  parsed: ParsedArtifacts;
  revisedText: string;
  resultText: string;
  winnersText: string;
}> {
  const votingPage = sources.find((source) => source.title === `Commons:Photo challenge/${request.challenge}/Voting`);
  const votingIndex = sources.find((source) => source.title === "Commons:Photo challenge/Voting");
  const parsedVoting = votingPage ? parseVotingPage(votingPage.content) : { files: [], votes: [] };
  const challenges = votingIndex ? parseVotingChallenges(votingIndex.content) : [];

  updateProgress(jobId, {
    percent: 50,
    step: "Validating voters",
    message: "Checking voter eligibility and challenge participation rules."
  });
  const voters = await validateVoters(bot, parsedVoting.votes, request.challenge);

  updateProgress(jobId, {
    percent: 62,
    step: "Validating votes",
    message: "Applying duplicate, self-vote, award-tier, and deadline validation rules."
  });
  const votes = validateVotes(parsedVoting.votes, voters, request.challenge);

  updateProgress(jobId, {
    percent: 72,
    step: "Scoring results",
    message: "Calculating score, support, and rank for each file."
  });
  const scoredFiles = countVotes(parsedVoting.files, votes);
  const errors = listErrors(votes, voters, request.challenge);

  updateProgress(jobId, {
    percent: 82,
    step: "Rendering outputs",
    message: "Rendering revised voting page, result page, and winners page."
  });

  const revisedText = votingPage ? reviseVotingPage(votingPage.content) : "";
  const resultText = renderResultPage(scoredFiles, new Set(parsedVoting.votes.map((vote) => vote.voter).filter(Boolean)).size, errors);
  const winnersText = renderWinnersPage(scoredFiles, request.challenge);

  const parsed = parseProcessChallengeArtifacts(request, challenges, parsedVoting.files, votes, voters, scoredFiles);
  const lateVotes = votes.filter((vote) => vote.error === 9).length;
  if (lateVotes > 0) {
    jobStore.appendMessage(jobId, `Detected ${lateVotes} late vote(s) after the deadline of ${getVoteDeadline(request.challenge).toFormat("yyyy-MM-dd HH:mm")} UTC.`);
  }
  return { parsed, revisedText, resultText, winnersText };
}

async function persistCommonArtifacts(
  generatedDir: string,
  challengeSlug: string,
  sources: ReadPageResult[],
  parsed: ParsedArtifacts
): Promise<void> {
  await writeFile(path.join(generatedDir, `${challengeSlug}_summary.txt`), parsed.summaryLines.join("\n"), "utf8");
  await writeFile(
    path.join(generatedDir, `${challengeSlug}_sources.json`),
    JSON.stringify(
      sources.map((source) => ({
        title: source.title,
        revisionTimestamp: source.revisionTimestamp,
        revisionId: source.revisionId,
        contentLength: source.content.length,
        preview: source.content.slice(0, 500)
      })),
      null,
      2
    ),
    "utf8"
  );
  await writeFile(path.join(generatedDir, `${challengeSlug}_challenges.json`), JSON.stringify(parsed.challenges, null, 2), "utf8");
  await writeFile(path.join(generatedDir, `${challengeSlug}_files.json`), JSON.stringify(parsed.files, null, 2), "utf8");
  await writeFile(path.join(generatedDir, `${challengeSlug}_votes.json`), JSON.stringify(parsed.votes, null, 2), "utf8");
}

async function finalizeJob(
  logsDir: string,
  jobId: string,
  request: JobRequest,
  currentUser: string | null,
  timestamp: string | null,
  sourceCount: number,
  challengeCount: number,
  fileCount: number,
  voteCount: number
): Promise<void> {
  updateProgress(jobId, {
    percent: 90,
    step: "Writing logs",
    message: "Persisting run metadata to the fixed output directory."
  });

  await writeFile(
    path.join(logsDir, "job.log"),
    [
      `jobId=${jobId}`,
      `status=completed`,
      `action=${request.action}`,
      `challenge=${request.challenge}`,
      `publishMode=${request.publishMode}`,
      `name=${request.credentials.name}`,
      `loggedInAs=${currentUser ?? "unknown"}`,
      `sourceCount=${sourceCount}`,
      `challengeCount=${challengeCount}`,
      `fileCount=${fileCount}`,
      `voteCount=${voteCount}`,
      `completedAt=${timestamp}`
    ].join("\n"),
    "utf8"
  );
}

async function persistFailedJob(logsDir: string, jobId: string, request: JobRequest, errorMessage: string): Promise<void> {
  const timestamp = DateTime.now().toUTC().toISO();
  await writeFile(
    path.join(logsDir, "job.log"),
    [
      `jobId=${jobId}`,
      `status=failed`,
      `action=${request.action}`,
      `challenge=${request.challenge}`,
      `publishMode=${request.publishMode}`,
      `name=${request.credentials.name}`,
      `errorMessage=${errorMessage.replace(/\r?\n/g, " ")}`,
      `completedAt=${timestamp}`
    ].join("\n"),
    "utf8"
  );
}

function getSourceSpecs(request: JobRequest): SourceSpec[] {
  if (request.action === "create-voting") {
    return [
      { label: "submission page", title: `Commons:Photo challenge/${request.challenge}`, fileName: "submission-page.txt" },
      { label: "submitting index", title: "Commons:Photo challenge/Submitting", fileName: "submitting-index.txt" }
    ];
  }

  return [
    { label: "voting page", title: `Commons:Photo challenge/${request.challenge}/Voting`, fileName: "voting-page.txt" },
    { label: "voting index", title: "Commons:Photo challenge/Voting", fileName: "voting-index.txt" }
  ];
}

async function enrichCreateVotingSources(bot: CommonsBot, request: JobRequest, sources: ReadPageResult[], inputDir: string, jobId: string): Promise<void> {
  const submissionPage = sources.find((source) => source.title === `Commons:Photo challenge/${request.challenge}`);
  if (!submissionPage) return;

  const inlineFiles = parseSubmissionPage(submissionPage.content);
  if (inlineFiles.length > 0) {
    jobStore.appendMessage(jobId, `Found ${inlineFiles.length} inline gallery files on the main challenge page.`);
    return;
  }

  const prefix = extractPrefixIndexPrefix(submissionPage.content);
  if (!prefix) {
    jobStore.appendMessage(jobId, "No inline gallery or PrefixIndex template found on the submission page.");
    return;
  }

  const normalizedPrefix = prefix.replace(/^Commons:/i, "");
  updateProgress(jobId, { percent: 45, step: "Discovering submission subpages", message: `Listing subpages under Commons:${normalizedPrefix}` });
  const titles = await bot.listPagesByPrefix(normalizedPrefix, 4);
  const filteredTitles = titles.filter((title) => title !== submissionPage.title);
  jobStore.appendMessage(jobId, `Discovered ${filteredTitles.length} submission subpages from PrefixIndex.`);

  for (let index = 0; index < filteredTitles.length; index += 1) {
    const title = filteredTitles[index];
    const page = await bot.readPage(title);
    sources.push(page);
    await writeFile(path.join(inputDir, `subpage-${String(index + 1).padStart(2, "0")}.txt`), page.content, "utf8");
  }
}

async function loadSubmissionEntries(bot: CommonsBot, request: JobRequest, sources: ReadPageResult[], jobId: string): Promise<EnrichedSubmissionEntry[]> {
  const submissionSources = sources.filter((source) => source.title.startsWith(`Commons:Photo challenge/${request.challenge}`));
  const dedupedFiles = dedupeSubmissionFiles(submissionSources.flatMap((source) => parseSubmissionPage(source.content)));
  if (dedupedFiles.length === 0) return [];

  const infoByName = new Map<string, FileInfoLookup>((await bot.listFileInfo(dedupedFiles.map((file) => file.fileName))).map((info) => [info.fileName, info]));
  const counters = new Map<string, number>();
  const enriched = dedupedFiles.map((file) => {
    const info = infoByName.get(file.fileName);
    const userKey = info?.user ?? "";
    const seenCount = counters.get(userKey) ?? 0;
    const active = Boolean(userKey) && seenCount < 4;
    counters.set(userKey, seenCount + 1);

    return {
      ...file,
      user: info?.user ?? null,
      uploaded: info?.uploaded ?? null,
      width: info?.width ?? null,
      height: info?.height ?? null,
      comment: info?.comment ?? null,
      ownWork: info?.ownWork ?? false,
      exists: info?.exists ?? false,
      active
    };
  });

  const missingCount = enriched.filter((entry) => !entry.exists).length;
  const inactiveCount = enriched.filter((entry) => !entry.active).length;
  const nonOwnWorkCount = enriched.filter((entry) => entry.exists && !entry.ownWork).length;
  jobStore.appendMessage(jobId, `Loaded metadata for ${enriched.length} files (${missingCount} missing, ${inactiveCount} over-limit, ${nonOwnWorkCount} not marked own-work).`);
  return enriched;
}

function parseCreateVotingArtifacts(request: JobRequest, sources: ReadPageResult[], submissionEntries: EnrichedSubmissionEntry[]): ParsedArtifacts {
  const submissionPage = sources.find((source) => source.title === `Commons:Photo challenge/${request.challenge}`);
  const submittingIndex = sources.find((source) => source.title === "Commons:Photo challenge/Submitting");
  const challenges = submittingIndex ? parseSubmittedChallenges(submittingIndex.content) : [];
  const submissionSources = sources.filter((source) => source.title.startsWith(`Commons:Photo challenge/${request.challenge}`));
  const files = submissionEntries;

  return {
    summaryLines: [
      `Action: ${request.action}`,
      `Challenge: ${request.challenge}`,
      `Configured login name: ${request.credentials.name}`,
      "",
      `Submitting index challenges found: ${challenges.length}`,
      `Submission sources crawled: ${submissionSources.length}`,
      `Submission gallery files found: ${files.length}`,
      `Uses PrefixIndex: ${submissionPage ? String(Boolean(extractPrefixIndexPrefix(submissionPage.content))) : "false"}`,
      `Missing files: ${files.filter((file) => !file.exists).length}`,
      `Over-limit files: ${files.filter((file) => !file.active).length}`,
      `Files not marked own-work: ${files.filter((file) => file.exists && !file.ownWork).length}`,
      "",
      "Recent challenges from Submitting index:",
      ...challenges.slice(0, 10).map((challenge) => `- ${challenge.raw}`),
      "",
      "First enriched submission files:",
      ...files.slice(0, 10).map((file) => `- ${file.fileName} :: ${file.title} :: ${file.user ?? "unknown"} :: ${file.uploaded ?? "n/a"}`)
    ],
    challenges,
    files,
    votes: []
  };
}

function parseProcessChallengeArtifacts(
  request: JobRequest,
  challenges: Array<{ raw: string }>,
  files: VotingFile[],
  votes: VoteWithError[],
  voters: VoterValidation[],
  scoredFiles: ScoredVotingFile[]
): ParsedArtifacts {
  const deadline = getVoteDeadline(request.challenge);
  return {
    summaryLines: [
      `Action: ${request.action}`,
      `Challenge: ${request.challenge}`,
      `Configured login name: ${request.credentials.name}`,
      `Vote deadline (UTC): ${deadline.toFormat("yyyy-MM-dd HH:mm")}`,
      "",
      `Voting index challenges found: ${challenges.length}`,
      `Voting page files parsed: ${files.length}`,
      `Votes parsed: ${votes.length}`,
      `Invalid votes: ${votes.filter((vote) => vote.error > 0).length}`,
      `Late votes: ${votes.filter((vote) => vote.error === 9).length}`,
      `Voters checked: ${voters.length}`,
      `Ranked files: ${scoredFiles.length}`,
      "",
      "Top ranked files:",
      ...scoredFiles.slice(0, 10).map((file) => `- #${file.rank} ${file.fileName} :: score ${file.score} :: support ${file.support}`)
    ],
    challenges,
    files: scoredFiles,
    votes
  };
}

function dedupeSubmissionFiles(files: SubmissionEntry[]): SubmissionEntry[] {
  const seen = new Set<string>();
  const result: SubmissionEntry[] = [];
  for (const file of files) {
    const key = `${file.fileName}|||${file.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(file);
  }
  return result;
}

type PublishPageType = "voting" | "result" | "winners";

export function getSandboxRootForName(loginName: string): string {
  const mainAccount = loginName.trim().split("@")[0]?.trim() ?? "";
  const normalized = mainAccount.replace(/^User:/i, "").replace(/\s+/g, "_");
  return `User:${normalized}/Sandbox`;
}

export function resolvePublishTarget(
  loginName: string,
  challenge: string,
  pageType: PublishPageType,
  publishMode: "sandbox" | "live"
): string {
  if (publishMode === "live") {
    if (pageType === "voting") return `Commons:Photo challenge/${challenge}/Voting`;
    if (pageType === "result") return `Commons:Photo challenge/${challenge}/Voting/Result`;
    return `Commons:Photo challenge/${challenge}/Winners`;
  }

  const sandboxRoot = getSandboxRootForName(loginName);
  if (pageType === "voting") return `${sandboxRoot}/${challenge}/Voting`;
  if (pageType === "result") return `${sandboxRoot}/${challenge}/Voting/Result`;
  return `${sandboxRoot}/${challenge}/Winners`;
}

async function publishPage(
  bot: CommonsBot,
  jobId: string,
  loginName: string,
  challenge: string,
  pageType: PublishPageType,
  text: string,
  editSummary: string,
  publishMode: PublishMode
): Promise<void> {
  if (publishMode === "dry-run") return;

  const target = resolvePublishTarget(loginName, challenge, pageType, publishMode);
  jobStore.appendMessage(jobId, `Publishing ${pageType} page to ${target}`);
  const saveResult = await bot.savePage(target, text, editSummary);
  const revNote = saveResult.newRevisionId ? ` (revision ${saveResult.newRevisionId})` : "";
  jobStore.appendMessage(jobId, `Published ${pageType} page → ${saveResult.result}${revNote}`);
}

function updateProgress(jobId: string, step: ProgressStep): void {
  jobStore.markRunning(jobId, step.step, step.percent);
  jobStore.appendMessage(jobId, step.message);
}

async function publishRawPage(
  bot: CommonsBot,
  jobId: string,
  label: string,
  targetTitle: string,
  text: string,
  editSummary: string
): Promise<void> {
  jobStore.appendMessage(jobId, `Publishing ${label} to ${targetTitle}`);
  const saveResult = await bot.savePage(targetTitle, text, editSummary);
  const revNote = saveResult.newRevisionId ? ` (revision ${saveResult.newRevisionId})` : "";
  jobStore.appendMessage(jobId, `Published ${label} → ${saveResult.result}${revNote}`);
}

async function runArchivePages(
  bot: CommonsBot,
  paths: Awaited<ReturnType<typeof ensureJobOutputPaths>>,
  jobId: string,
  request: JobRequest
): Promise<void> {
  const archivePairs = [
    {
      source: "Commons:Photo challenge/Submitting",
      liveTarget: "Commons:Photo challenge/Submitting_old",
      fileName: "submitting.txt"
    },
    {
      source: "Commons:Photo challenge/Voting",
      liveTarget: "Commons:Photo challenge/Voting_old",
      fileName: "voting.txt"
    }
  ];

  for (let i = 0; i < archivePairs.length; i += 1) {
    const pair = archivePairs[i];
    updateProgress(jobId, {
      percent: 20 + i * 30,
      step: `Archiving ${pair.source}`,
      message: `Reading ${pair.source}`
    });
    const page = await bot.readPage(pair.source);
    await writeFile(path.join(paths.inputDir, pair.fileName), page.content, "utf8");
    jobStore.appendMessage(jobId, `Read ${pair.source} (${page.content.length} chars)`);

    if (request.publishMode === "live") {
      await publishRawPage(bot, jobId, pair.source, pair.liveTarget, page.content, `Photo Challenge bot: archive ${pair.source}`);
    }
  }

  updateProgress(jobId, { percent: 88, step: "Publish mode", message: `Publish mode: ${request.publishMode}` });
}

async function runBuildVotingIndex(
  bot: CommonsBot,
  paths: Awaited<ReturnType<typeof ensureJobOutputPaths>>,
  jobId: string,
  request: JobRequest
): Promise<string> {
  const sourceTitle = (request.source ?? "old") === "old"
    ? "Commons:Photo challenge/Submitting_old"
    : "Commons:Photo challenge/Submitting";

  updateProgress(jobId, { percent: 20, step: "Reading challenge list", message: `Fetching ${sourceTitle}` });
  const sourcePage = await bot.readPage(sourceTitle);
  await writeFile(path.join(paths.inputDir, "submitting-source.txt"), sourcePage.content, "utf8");

  const challenges = parseSubmittedChallenges(sourcePage.content);
  if (challenges.length === 0) {
    jobStore.appendMessage(jobId, "No challenges found in source page.");
    return "";
  }
  jobStore.appendMessage(jobId, `Found ${challenges.length} challenge(s): ${challenges.map((c) => c.raw).join(", ")}`);

  const entries: VotingIndexEntry[] = [];
  for (let i = 0; i < challenges.length; i += 1) {
    const challenge = challenges[i];
    updateProgress(jobId, {
      percent: 35 + Math.round((i / challenges.length) * 40),
      step: `Reading challenge page`,
      message: `Fetching Commons:Photo challenge/${challenge.raw}`
    });

    const challengePage = await bot.readPage(`Commons:Photo challenge/${challenge.raw}`);
    const challengeCode = extractChallengeCode(challengePage.content);
    if (challengeCode) {
      entries.push({ challenge: challenge.raw, challengeCode });
    } else {
      jobStore.appendMessage(jobId, `Warning: no === header === found in Commons:Photo challenge/${challenge.raw}`);
    }
  }

  const section = renderVotingIndexSection(entries);
  updateProgress(jobId, { percent: 88, step: "Rendering voting index section", message: `Generated ${entries.length} entries.` });
  return section;
}


