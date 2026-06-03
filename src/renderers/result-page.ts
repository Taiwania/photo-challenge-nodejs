import type { ScoredVotingFile } from "../core/scoring.js";
import type { EntryMode } from "../core/models.js";

function inferMode(files: ScoredVotingFile[]): EntryMode {
  return files.find((file) => file.mode && file.mode !== "single")?.mode ?? "single";
}

function submissionMembers(file: ScoredVotingFile): Array<{ fileName: string }> {
  return file.members?.filter((member) => member.role === "submission" && member.fileName) ?? [{ fileName: file.fileName }];
}

function renderImageCell(fileName: string): string {
  return `[[File:${fileName}|120px]]`;
}

function renderHeader(mode: EntryMode): string[] {
  if (mode === "duo-coequal") {
    return [
      "! Image1 !! Image2 !! Author !! data-sort-type=\"number\" | Rank !! data-sort-type=\"number\" | Score !! data-sort-type=\"number\" | Support"
    ];
  }

  return [
    '! class="unsortable"| Image',
    "! Author",
    '! data-sort-type="number" | Rank',
    '! data-sort-type="number" | Score',
    '! data-sort-type="number" | Support'
  ];
}

function renderFileRow(file: ScoredVotingFile, mode: EntryMode, userText: string): string {
  if (mode === "duo-coequal") {
    const [first, second] = submissionMembers(file);
    return `|-\n| ${renderImageCell(first?.fileName ?? file.fileName)} || ${renderImageCell(second?.fileName ?? file.fileName)} || ${userText} || ${file.rank} || ${file.score} || ${file.support}`;
  }

  return `|-\n| ${renderImageCell(file.fileName)} || ${userText} || ${file.rank} || ${file.score} || ${file.support}`;
}

export function renderResultPage(files: ScoredVotingFile[], voterCount: number, errors: string[]): string {
  const mode = inferMode(files);
  const contributorCount = new Set(files.map((file) => file.creator)).size;
  const imageCount = new Set(files.map((file) => file.num)).size;
  const talkLink = '<span class="signature-talk">{{int:Talkpagelinktext}}</span>';
  const lines = [
    `*Number of contributors: ${contributorCount}`,
    `*Number of voters:       ${voterCount}`,
    `*Number of images:       ${imageCount}`,
    "",
    "The Score is the sum of the 3*/2*/1* votes. The Support is the count of 3*/2*/1* votes and 0* likes. In the event of a tie vote, the support decides the rank.",
    "",
    '{| class="sortable wikitable"',
    "|-",
    ...renderHeader(mode)
  ];

  for (const file of files) {
    if (file.support === 0) {
      continue;
    }

    const userText = `[[User:${file.creator}|${file.creator}]] ([[User talk:${file.creator}|${talkLink}]])`;
    lines.push(renderFileRow(file, mode, userText));
  }

  lines.push("|}");
  lines.push("");
  lines.push(...errors);
  return `${lines.join("\n")}\n`;
}
