import path from "node:path";
import { DateTime } from "luxon";

export type VotingSubmissionEntry = {
  fileName: string;
  title: string;
  user: string | null;
  uploaded: string | null;
  width: number | null;
  height: number | null;
  comment: string | null;
  ownWork: boolean;
  exists: boolean;
  active: boolean;
};

export type RenderedVotingPage = {
  text: string;
  includedCount: number;
  issueCount: number;
};

const SIZE_PX = 240000;
const COLLAPSE_TEXT = "{{Collapse top|Current votes – please choose your own winners before looking}}";

export function renderVotingPage(challenge: string, files: VotingSubmissionEntry[]): RenderedVotingPage {
  const [year, monthName, ...themeParts] = challenge.split(" - ");
  const theme = themeParts.join(" - ");
  const minUploadDate = DateTime.fromFormat(`1 ${monthName} ${year}`, "d MMMM yyyy", { zone: "utc" });
  const maxUploadDate = minUploadDate.plus({ days: 31, hours: 12 }).set({ day: 1 });
  const voteCloseTime = maxUploadDate.plus({ days: 31 }).set({ day: 1 });

  const minUploadStr = minUploadDate.toFormat("yyyy-LL-dd HH:mm:ss");
  const maxUploadStr = maxUploadDate.toFormat("yyyy-LL-dd HH:mm:ss");

  let includedCount = 0;
  const issues: string[] = [];
  const lines: string[] = [
    "__NOTOC__",
    "",
    `'''Voting will end at midnight UTC on ${voteCloseTime.toFormat("dd MMMM yyyy")}'''. The theme was '''${theme}'''.`,
    "",
    "{{Commons:Photo challenge/Voting header/{{SuperFallback|Commons:Photo challenge/Voting header}}}}",
    "{{Commons:Photo challenge/Voting example}}",
    ""
  ];

  for (const file of files) {
    const fileUser = file.user;
    const uploadedValue = file.uploaded;
    const fileUploaded = uploadedValue ? DateTime.fromISO(uploadedValue, { zone: "utc" }) : null;
    const fileName = file.fileName;

    if (!file.exists || !fileUser || !fileUploaded || !fileUploaded.isValid || !fileName) {
      issues.push(`File [[:File:${fileName}]] does not exist`);
      continue;
    }

    const userLink = `[[User:${fileUser}|${fileUser}]]`;
    const dateStr = fileUploaded.toFormat("yyyy-LL-dd HH:mm:ss");
    let issue = "";

    if (fileUploaded < minUploadDate) {
      issue = `REMOVED: [[:File:${fileName}]] by ${userLink} was uploaded ${dateStr} before the challenge opened ${minUploadStr}.`;
    }

    if (fileUploaded >= maxUploadDate) {
      issue = `REMOVED: [[:File:${fileName}]] by ${userLink} was uploaded ${dateStr} after the challenge closed ${maxUploadStr}.`;
    }

    if (!file.active) {
      issue = `REMOVED: [[:File:${fileName}]] by ${userLink}, since the user uploded more than allowed 4 entries.`;
    }

    if (issue) {
      issues.push(issue);
      continue;
    }

    const width = file.width;
    const height = file.height;
    if (!width || !height) {
      issues.push(`REMOVED: [[:File:${fileName}]] by ${userLink} is missing size metadata.`);
      continue;
    }

    includedCount += 1;
    const thumbWidth = Math.max(1, Math.floor(Math.sqrt((SIZE_PX * width) / height)));
    const fileLink = `[{{filepath:${fileName}}}<br>''(Full size image)'']`;
    const anchor = `<span class="anchor" id="${includedCount}">${includedCount}</span>`;
    const fileBaseName = path.basename(fileName);
    const megapixels = (width * height / 1e6).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");

    lines.push(`===${anchor}. ${fileBaseName}===`);
    lines.push(`[[File:${fileName}|none|thumb|${thumbWidth}px|${file.title} ${fileLink}]]`);
    lines.push(`<!-- '''Creator:''' ${userLink} --> '''Uploaded:''' ${dateStr} '''Size''': ${width} × ${height} (${megapixels} MP) ${COLLAPSE_TEXT}`);
    lines.push("<!-- Vote below this line -->");
    lines.push("<!-- Vote above this line -->");
    lines.push("{{Collapse bottom}}");
    lines.push("");
  }

  if (issues.length > 0) {
    lines.push("=== Issues corrected by the [[Commons:Photo challenge/code/create voting.py|software]] ===");
    for (const issue of issues) {
      lines.push(`* ${issue}`);
    }
  }

  return {
    text: `${lines.join("\n")}\n`,
    includedCount,
    issueCount: issues.length
  };
}
