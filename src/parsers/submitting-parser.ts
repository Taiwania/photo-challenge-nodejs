export type SubmissionChallenge = {
  raw: string;
  year: string;
  month: string;
  theme: string;
};

export type SubmissionEntry = {
  fileName: string;
  title: string;
};

function stripComments(text: string): string {
  return text.replace(/<!--([\s\S]*?)-->/g, "");
}

export function parseSubmittedChallenges(wikiText: string): SubmissionChallenge[] {
  const cleaned = stripComments(wikiText);
  const matches = cleaned.matchAll(/\{\{Commons:Photo challenge\/([^}]+)\}\}/g);
  const seen = new Set<string>();
  const challenges: SubmissionChallenge[] = [];

  for (const match of matches) {
    const raw = match[1]?.trim();
    if (!raw || seen.has(raw)) {
      continue;
    }

    seen.add(raw);
    const [year = "", month = "", ...themeParts] = raw.split(" - ");
    challenges.push({
      raw,
      year,
      month,
      theme: themeParts.join(" - ")
    });
  }

  return challenges;
}

export function parseSubmissionPage(wikiText: string): SubmissionEntry[] {
  const files: SubmissionEntry[] = [];
  let seekingGallery = true;

  for (const rawLine of wikiText.split(/\r?\n/)) {
    let line = rawLine.trim();

    if (seekingGallery) {
      if (line.startsWith("<gallery") && /\b250px\b/i.test(line)) {
        seekingGallery = false;
      }
      continue;
    }

    if (!line || line.startsWith("<!--")) {
      continue;
    }

    if (line.startsWith("</gallery>")) {
      break;
    }

    line = line.replace(/\|thumb/gi, "").replace(/\[\[/g, "").replace(/\]\]/g, "");
    const separator = line.indexOf("|");
    const rawFileName = separator >= 0 ? line.slice(0, separator) : line;
    let title = separator >= 0 ? line.slice(separator + 1).trim() : "";

    let fileName = rawFileName.replace(/^file:/i, "").replace(/_/g, " ").trim();
    if (!fileName || fileName === "CLICK HERE To submit your photos to the challenge.svg") {
      continue;
    }

    if (!title) {
      const dot = fileName.lastIndexOf(".");
      title = dot === -1 ? fileName : fileName.slice(0, dot);
    }

    files.push({ fileName, title });
  }

  return files;
}

export function extractPrefixIndexPrefix(wikiText: string): string | null {
  const match = wikiText.match(/\{\{\s*Special:PrefixIndex\/([^}|]+?)(?:\|[^}]*)?\}\}/i);
  return match?.[1]?.trim() ?? null;
}
