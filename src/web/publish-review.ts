import type { JobProgress } from "../core/models.js";
import { resolvePublishTarget } from "../workflows/run-job.js";

type PublishArtifactType = "voting" | "result" | "winners" | "revised";

type PublishTargetType = "voting" | "result" | "winners";

export type PublishableArtifact = {
  type: PublishArtifactType;
  label: string;
  fileName: string;
  content: string;
  targetType: PublishTargetType;
  targetTitle: string;
};

export type PublishDiffSummary = {
  status: "new" | "same" | "changed";
  currentLineCount: number;
  nextLineCount: number;
  changedLineCount: number;
  firstDifferenceLine: number | null;
  currentSnippet: string[];
  nextSnippet: string[];
};

const artifactDefinitions: Array<{
  type: PublishArtifactType;
  suffix: string;
  label: string;
  targetType: PublishTargetType;
}> = [
  { type: "voting", suffix: "_voting.txt", label: "Voting Page", targetType: "voting" },
  { type: "revised", suffix: "_revised.txt", label: "Revised Voting", targetType: "voting" },
  { type: "result", suffix: "_result.txt", label: "Result Page", targetType: "result" },
  { type: "winners", suffix: "_winners.txt", label: "Winners Page", targetType: "winners" }
];

export function buildPublishableArtifacts(
  job: JobProgress,
  generatedFiles: Array<{ name: string; content: string }>,
  mode: "sandbox" | "live"
): PublishableArtifact[] {
  const artifacts = artifactDefinitions.flatMap((definition) => {
    const file = generatedFiles.find((entry) => entry.name.endsWith(definition.suffix));
    if (!file) return [];

    return [{
      type: definition.type,
      label: definition.label,
      fileName: file.name,
      content: file.content,
      targetType: definition.targetType,
      targetTitle: resolvePublishTarget(job.loginName, job.challenge, definition.targetType, mode)
    }];
  });

  if (artifacts.some((artifact) => artifact.type === "revised")) {
    return artifacts.filter((artifact) => artifact.type !== "voting");
  }

  return artifacts;
}

export function summarizePublishDiff(currentContent: string | null, nextContent: string): PublishDiffSummary {
  const normalizedCurrent = normalizeContent(currentContent);
  const normalizedNext = normalizeContent(nextContent);
  const currentLines = splitLines(normalizedCurrent);
  const nextLines = splitLines(normalizedNext);

  if (normalizedCurrent === null) {
    return {
      status: "new",
      currentLineCount: 0,
      nextLineCount: nextLines.length,
      changedLineCount: nextLines.length,
      firstDifferenceLine: 1,
      currentSnippet: [],
      nextSnippet: nextLines.slice(0, 5)
    };
  }

  if (normalizedCurrent === normalizedNext) {
    return {
      status: "same",
      currentLineCount: currentLines.length,
      nextLineCount: nextLines.length,
      changedLineCount: 0,
      firstDifferenceLine: null,
      currentSnippet: currentLines.slice(0, 3),
      nextSnippet: nextLines.slice(0, 3)
    };
  }

  const maxLength = Math.max(currentLines.length, nextLines.length);
  let firstDifferenceIndex = 0;
  let changedLineCount = 0;

  for (let index = 0; index < maxLength; index += 1) {
    if (currentLines[index] !== nextLines[index]) {
      if (changedLineCount === 0) {
        firstDifferenceIndex = index;
      }
      changedLineCount += 1;
    }
  }

  return {
    status: "changed",
    currentLineCount: currentLines.length,
    nextLineCount: nextLines.length,
    changedLineCount,
    firstDifferenceLine: firstDifferenceIndex + 1,
    currentSnippet: currentLines.slice(firstDifferenceIndex, firstDifferenceIndex + 5),
    nextSnippet: nextLines.slice(firstDifferenceIndex, firstDifferenceIndex + 5)
  };
}

function normalizeContent(content: string | null): string | null {
  if (content === null) return null;
  return content.replace(/\r\n/g, "\n").replace(/\s+$/u, "");
}

function splitLines(content: string | null): string[] {
  if (!content) return [];
  return content.split("\n");
}
