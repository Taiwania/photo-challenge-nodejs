import path from "node:path";
import { writeFile } from "node:fs/promises";
import type { AuthenticatedWorkflowContext, WorkflowSummary } from "./job-runner-support.js";
import { updateProgress } from "./job-runner-support.js";
import { parseSubmittedChallenges } from "../parsers/submitting-parser.js";
import { extractChallengeCode, renderVotingIndexSection, type VotingIndexEntry } from "../renderers/voting-index.js";
import { jobStore } from "../infra/job-store.js";

export async function runBuildVotingIndexWorkflow({
  bot,
  paths,
  jobId,
  request
}: AuthenticatedWorkflowContext): Promise<WorkflowSummary> {
  const sourceTitle = (request.source ?? "old") === "old"
    ? "Commons:Photo challenge/Submitting_old"
    : "Commons:Photo challenge/Submitting";

  updateProgress(jobId, { percent: 20, step: "Reading challenge list", message: `Fetching ${sourceTitle}` });
  const sourcePage = await bot.readPage(sourceTitle);
  await writeFile(path.join(paths.inputDir, "submitting-source.txt"), sourcePage.content, "utf8");

  const challenges = parseSubmittedChallenges(sourcePage.content);
  if (challenges.length === 0) {
    jobStore.appendMessage(jobId, "No challenges found in source page.");
    await writeFile(path.join(paths.generatedDir, "voting_index_section.txt"), "", "utf8");
    return {
      sourceCount: 1,
      challengeCount: 0,
      fileCount: 0,
      voteCount: 0,
      completionMessage: `Voting index section written to ${paths.jobRoot}`
    };
  }
  jobStore.appendMessage(jobId, `Found ${challenges.length} challenge(s): ${challenges.map((c) => c.raw).join(", ")}`);

  const entries: VotingIndexEntry[] = [];
  for (let i = 0; i < challenges.length; i += 1) {
    const challenge = challenges[i];
    updateProgress(jobId, {
      percent: 35 + Math.round((i / challenges.length) * 40),
      step: "Reading challenge page",
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
  await writeFile(path.join(paths.generatedDir, "voting_index_section.txt"), section, "utf8");
  updateProgress(jobId, { percent: 88, step: "Rendering voting index section", message: `Generated ${entries.length} entries.` });
  return {
    sourceCount: 1,
    challengeCount: 0,
    fileCount: 0,
    voteCount: 0,
    completionMessage: `Voting index section written to ${paths.jobRoot}`
  };
}
