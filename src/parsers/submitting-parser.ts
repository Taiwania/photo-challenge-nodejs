export type SubmissionChallenge = {
  raw: string;
  year: string;
  month: string;
  theme: string;
};

export type SubmissionEntry = {
  fileName: string;
  title: string;
  sourceUrl?: string | null;
};

const SUBMIT_HELPER_IMAGES = new Set([
  "CLICK HERE To submit your photos to the challenge.svg",
  "W2321-ToInsertYourPicToChallengeClickBelow.svg"
]);

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
  const galleries: Array<{ afterEntriesHeading: boolean; header: string; lines: string[] }> = [];
  let sawEntriesHeading = false;
  let gallery: { afterEntriesHeading: boolean; header: string; lines: string[] } | null = null;

  for (const rawLine of wikiText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!gallery && /^={2,}.*(?:entries|\{\{\s*entries tag\s*\}\}).*={2,}$/i.test(line)) {
      sawEntriesHeading = true;
    }
    if (!gallery && line.startsWith("<gallery")) {
      gallery = { afterEntriesHeading: sawEntriesHeading, header: line, lines: [] };
      continue;
    }
    if (gallery && line.startsWith("</gallery>")) {
      galleries.push(gallery);
      gallery = null;
      continue;
    }
    if (gallery) {
      gallery.lines.push(line);
    }
  }

  const selected = galleries.find((candidate) => candidate.afterEntriesHeading)
    ?? galleries.find((candidate) => /\b(?:widths\s*=\s*)?250px\b/i.test(candidate.header));
  if (!selected) return [];

  return selected.lines.flatMap((rawLine) => {
    if (!rawLine || rawLine.startsWith("<!--")) return [];

    let line = rawLine.replace(/\|thumb/gi, "");
    if (/^\[\[(?:File:)?/i.test(line) && line.endsWith("]]")) {
      line = line.slice(2, -2);
    }
    const separator = line.indexOf("|");
    const rawFileName = separator >= 0 ? line.slice(0, separator) : line;
    let title = separator >= 0 ? line.slice(separator + 1).trim() : "";
    const fileName = rawFileName.replace(/^file:/i, "").replace(/_/g, " ").trim();

    if (!fileName || SUBMIT_HELPER_IMAGES.has(fileName)) return [];
    if (!title) {
      const dot = fileName.lastIndexOf(".");
      title = dot === -1 ? fileName : fileName.slice(0, dot);
    }

    const sourceUrl = title.match(/\[(https?:\/\/[^\s\]]+)/)?.[1] ?? null;
    return [{
      fileName,
      title,
      ...(sourceUrl ? { sourceUrl } : {})
    }];
  });
}

export function extractPrefixIndexPrefix(wikiText: string): string | null {
  const match = wikiText.match(/\{\{\s*Special:PrefixIndex\/([^}|]+?)(?:\|[^}]*)?\}\}/i);
  return match?.[1]?.trim() ?? null;
}
