import { DateTime } from "luxon";
import type { ScoredVotingFile } from "../core/scoring.js";

export type WinnerNotification = {
  recipient: string;
  fileName: string;
  rank: number;
  targetTitle: string;
  sectionHeading: string;
  bodyText: string;
  editSummary: string;
};

export type ChallengeAnnouncementInput = {
  challenge: string;
  files: ScoredVotingFile[];
};

export type ChallengeAnnouncement = {
  targetTitle: string;
  sectionHeading: string;
  bodyText: string;
  editSummary: string;
};

export type PreviousPageUpdatePlan = {
  targetTitle: string;
  prependText: string;
  editSummary: string;
};

export type FileAssessmentPlan = {
  fileTitle: string;
  templateText: string;
  editSummary: string;
};

const awardColors: Record<number, string> = {
  1: "Gold",
  2: "Silver",
  3: "Bronze"
};

export function buildWinnerNotifications(challenge: string, files: ScoredVotingFile[]): WinnerNotification[] {
  const { year, month, theme } = parseChallenge(challenge);

  return files
    .slice(0, 10)
    .filter((file) => file.rank >= 1 && file.rank <= 3)
    .map((file) => ({
      recipient: file.creator,
      fileName: file.fileName,
      rank: file.rank,
      targetTitle: `User talk:${file.creator}`,
      sectionHeading: `[[Commons:Photo challenge/${challenge}/Winners]]`,
      bodyText: `{{Photo Challenge ${awardColors[file.rank]}|File:${file.fileName}|${theme}|${year}|${month}}}--~~~~`,
      editSummary: "Announcing Photo Challenge winners"
    }));
}

export function buildChallengeAnnouncement(challenges: ChallengeAnnouncementInput[]): ChallengeAnnouncement {
  if (challenges.length !== 2) {
    throw new Error("buildChallengeAnnouncement expects exactly 2 challenges.");
  }

  const [first, second] = challenges;
  const { month } = parseChallenge(first.challenge);
  const winners = challenges.flatMap((challenge) => challenge.files.slice(0, 3).map((file) => file.creator));
  const linkedUsers = winners.map((user) => `[[User:${user}|]]`);
  const congratulations = linkedUsers.length > 1
    ? `Congratulations to ${linkedUsers.slice(0, -1).join(", ")} and ${linkedUsers.at(-1)}`
    : `Congratulations to ${linkedUsers[0] ?? "the winners"}`;

  return {
    targetTitle: "Commons talk:Photo challenge",
    sectionHeading: `[[Commons:Photo challenge|Photo challenge]] ${month} results`,
    bodyText: [
      `{{Commons:Photo challenge/${first.challenge}/Winners|height=240}}`,
      `{{Commons:Photo challenge/${second.challenge}/Winners|height=240}}`,
      `${congratulations}--~~~~`
    ].join("\n"),
    editSummary: "Announcing Photo Challenge winners"
  };
}

export function buildPreviousPageUpdate(challenges: string[]): PreviousPageUpdatePlan {
  if (challenges.length !== 2) {
    throw new Error("buildPreviousPageUpdate expects exactly 2 challenges.");
  }

  const { year, month, monthNumber } = parseChallenge(challenges[0]);
  const header = `{{ucfirst:{{ISOdate|${year}-${monthNumber}|{{PAGELANGUAGE}}}}}}`;

  return {
    targetTitle: "Commons:Photo challenge/Previous",
    prependText: [
      `=== ${header} ===`,
      `{{Commons:Photo challenge/${challenges[0]}/Winners}}`,
      `{{Commons:Photo challenge/${challenges[1]}/Winners}}`,
      ""
    ].join("\n"),
    editSummary: `Add ${month} winners`
  };
}

export function buildFileAssessmentPlans(challenges: ChallengeAnnouncementInput[]): FileAssessmentPlan[] {
  return challenges.flatMap(({ challenge, files }) => {
    const { year, month, theme } = parseChallenge(challenge);
    return files.slice(0, 3).map((file, index) => ({
      fileTitle: `File:${file.fileName}`,
      templateText: `{{Photo challenge winner|${index + 1}|${theme}|${year}|${month}}}\n\n`,
      editSummary: "Assessment added - congratulations"
    }));
  });
}

export function insertAssessmentTemplate(pageText: string, templateText: string): string {
  const assessmentHeader = "=={{Assessment}}==\n";
  const licenseMarker = "=={{int:license-header}}==";
  const otherVersionsMarker = "|other versions=\n}}\n\n";
  const categoryMarker = "[[Category:";

  if (pageText.includes("{{Photo challenge winner")) {
    return pageText;
  }

  if (pageText.includes(licenseMarker)) {
    const [before, after] = splitOnce(pageText, licenseMarker);
    return `${before}${assessmentHeader}${templateText}${licenseMarker}${after}`;
  }

  if (pageText.includes(otherVersionsMarker)) {
    const [before, after] = splitOnce(pageText, otherVersionsMarker);
    return `${before}${otherVersionsMarker}${assessmentHeader}${templateText}${after}`;
  }

  if (pageText.includes(categoryMarker)) {
    const [before, after] = splitOnce(pageText, categoryMarker);
    return `${before}${assessmentHeader}${templateText}${categoryMarker}${after}`;
  }

  return `${pageText.trimEnd()}\n\n${assessmentHeader}${templateText}`;
}

function splitOnce(text: string, marker: string): [string, string] {
  const index = text.indexOf(marker);
  if (index < 0) {
    return [text, ""];
  }
  return [text.slice(0, index), text.slice(index + marker.length)];
}

function parseChallenge(challenge: string): { year: string; month: string; monthNumber: string; theme: string } {
  const [year, month, ...themeParts] = challenge.split(" - ");
  const parsedMonth = DateTime.fromFormat(month, "MMMM", { zone: "utc", locale: "en" });
  return {
    year,
    month,
    monthNumber: parsedMonth.isValid ? parsedMonth.toFormat("MM") : "01",
    theme: themeParts.join(" - ")
  };
}
