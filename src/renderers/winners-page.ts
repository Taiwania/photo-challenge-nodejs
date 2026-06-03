import type { ScoredVotingFile } from "../core/scoring.js";
import type { EntryMode } from "../core/models.js";

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
  const mode = inferMode(files);
  if (mode === "duo-coequal") {
    return renderDuoCoequalWinnersPage(files, challenge);
  }
  if (mode === "duo-reference") {
    return renderDuoReferenceWinnersPage(files, challenge);
  }
  return renderSingleWinnersPage(files, challenge);
}

function inferMode(files: ScoredVotingFile[]): EntryMode {
  return files.find((file) => file.mode && file.mode !== "single")?.mode ?? "single";
}

function getTheme(challenge: string): string {
  const [, , ...themeParts] = challenge.split(" - ");
  return themeParts.join(" - ");
}

function submissionMembers(file: ScoredVotingFile): Array<{ fileName: string; title: string }> {
  return file.members?.filter((member) => member.role === "submission" && member.fileName) ?? [{
    fileName: file.fileName,
    title: file.title
  }];
}

function referenceMembers(file: ScoredVotingFile): Array<{ fileName: string; title: string }> {
  return file.members?.filter((member) => member.role === "reference" && member.fileName) ?? [];
}

function wikiUser(user: string): string {
  return `[[User:${user}|${user}]]`;
}

function renderDuoNavCaption(challenge: string): string {
  const theme = getTheme(challenge);
  return `|+ <big>'''{{Photo challenge theme|${theme}}}: [[Commons:Photo challenge/${challenge}|Entries]] • [[Commons:Photo challenge/${challenge}/Voting|Votes]] • [[Commons:Photo challenge/${challenge}/Voting/Result|Scores]]'''</big>`;
}

function renderDuoTable(challenge: string, rows: string[][]): string {
  const topThree = ["1", "2", "3"];
  const lines = [
    '{| class = "wikitable"',
    "|-",
    renderDuoNavCaption(challenge),
    `! Rank !! ${topThree.join(" !! ")}`
  ];

  for (const row of rows) {
    lines.push("|-");
    const [label, ...cells] = row;
    lines.push(`| ${[label, ...cells.slice(0, 3), ...Array(Math.max(0, 3 - cells.length)).fill("")].join(" || ")}`);
  }

  lines.push("|}");
  lines.push("");
  lines.push(`<noinclude>[[Category:Photo challenge/${challenge}]]</noinclude>`);
  return `${lines.join("\n")}\n`;
}

function renderDuoTitleCells(files: ScoredVotingFile[], titlePicker: (file: ScoredVotingFile) => string): string[] {
  return files.map((file) => addLineBreaks(titlePicker(file), 40));
}

function renderSingleWinnersPage(files: ScoredVotingFile[], challenge: string): string {
  const theme = getTheme(challenge);
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

function renderDuoCoequalWinnersPage(files: ScoredVotingFile[], challenge: string): string {
  const topThree = files.slice(0, 3);
  const imageCells = topThree.map((file) => submissionMembers(file)
    .map((member) => `[[File:${member.fileName}|x240px]]`)
    .join("<br/>"));
  const titleCells = renderDuoTitleCells(topThree, (file) => {
    const submissions = submissionMembers(file);
    return submissions.at(-1)?.title ?? file.title;
  });
  const authorCells = topThree.map((file) => wikiUser(file.creator));
  const scoreCells = topThree.map((file) => String(file.score));

  return renderDuoTable(challenge, [
    ["Image", ...imageCells],
    ["Title", ...titleCells],
    ["Author", ...authorCells],
    ["Score", ...scoreCells]
  ]);
}

function renderDuoReferenceWinnersPage(files: ScoredVotingFile[], challenge: string): string {
  const topThree = files.slice(0, 3);
  const referenceImageCells = topThree.map((file) => {
    const reference = referenceMembers(file)[0];
    return reference ? `[[File:${reference.fileName}|x240px]]` : "";
  });
  const referenceTitleCells = renderDuoTitleCells(topThree, (file) => referenceMembers(file)[0]?.title ?? "");
  const submissionImageCells = topThree.map((file) => {
    const submission = submissionMembers(file)[0];
    return `[[File:${submission?.fileName ?? file.fileName}|x240px]]`;
  });
  const submissionTitleCells = renderDuoTitleCells(topThree, (file) => submissionMembers(file)[0]?.title ?? file.title);
  const authorCells = topThree.map((file) => wikiUser(file.creator));
  const scoreCells = topThree.map((file) => String(file.score));

  return renderDuoTable(challenge, [
    ["Image", ...referenceImageCells],
    ["Title", ...referenceTitleCells],
    ["Image", ...submissionImageCells],
    ["Title", ...submissionTitleCells],
    ["Author", ...authorCells],
    ["Score", ...scoreCells]
  ]);
}
