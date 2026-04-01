import type { ScoredVotingFile } from "../core/scoring.js";

export function renderResultPage(files: ScoredVotingFile[], voterCount: number, errors: string[]): string {
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
    '! class="unsortable"| Image',
    "! Author",
    '! data-sort-type="number" | Rank',
    '! data-sort-type="number" | Score',
    '! data-sort-type="number" | Support'
  ];

  for (const file of files) {
    if (file.support === 0) {
      continue;
    }

    const userText = `[[User:${file.creator}|${file.creator}]] ([[User talk:${file.creator}|${talkLink}]])`;
    lines.push(`|-\n| [[File:${file.fileName}|120px]] || ${userText} || ${file.rank} || ${file.score} || ${file.support}`);
  }

  lines.push("|}");
  lines.push("");
  lines.push(...errors);
  return `${lines.join("\n")}\n`;
}
