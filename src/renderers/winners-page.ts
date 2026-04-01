import type { ScoredVotingFile } from "../core/scoring.js";

function addLineBreaks(sentence: string, maxLength: number): string {
  const words = sentence.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLength) {
      current = next;
    } else {
      if (current) {
        lines.push(current);
      }
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.join(" <br/>");
}

export function renderWinnersPage(files: ScoredVotingFile[], challenge: string): string {
  const [, , ...themeParts] = challenge.split(" - ");
  const theme = themeParts.join(" - ");
  const topThree = files.slice(0, 3);
  const lines = [
    "{{Photo challenge winners table",
    `|page     = Photo challenge/${challenge}`,
    `|theme    = ${theme}`,
    "|height   = {{{height|240}}}"
  ];

  topThree.forEach((file, index) => {
    const n = index + 1;
    lines.push(`|image_${n}  = ${file.fileName}`);
    lines.push(`|title_${n}  = ${addLineBreaks(file.title, 40)}`);
    lines.push(`|author_${n} = ${file.creator}`);
    lines.push(`|score_${n}  = ${file.score}`);
    lines.push(`|rank_${n}   = ${file.rank}`);
    lines.push(`|num_${n}    = ${file.num}`);
  });

  lines.push("}}");
  lines.push("");
  return `${lines.join("\n")}\n`;
}
