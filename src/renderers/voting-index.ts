import { DateTime } from "luxon";

export type VotingIndexEntry = {
  challenge: string;
  challengeCode: string;
};

/**
 * Scan the wikitext of a challenge's submission page for the first === header ===
 * and return the inner content transformed for use as a voting-index list item label.
 *
 * Python equivalent: the inner loop in get_new_text_of_voting_index that reads each
 * challenge page and extracts the section title.
 */
export function extractChallengeCode(challengePageWikiText: string): string | null {
  for (const rawLine of challengePageWikiText.split(/\r?\n/)) {
    const match = rawLine.trim().match(/^===\s+(.*?)\s+===$/);
    if (match) {
      // Add |link=- so the ISOdate template renders as plain text without a link
      return match[1].replace(/\|capitalization=ucfirst\}\}/, "|capitalization=ucfirst|link=-}}");
    }
  }
  return null;
}

/**
 * Render the new section block that should be prepended to Commons:Photo challenge/Voting.
 *
 * Output format:
 *   === {{ucfirst:{{ISOdate|YYYY-MM|{{PAGELANGUAGE}}}}}} ===
 *   * [[Commons:Photo challenge/<challenge>/Voting|<challengeCode>]]
 *   ...
 */
export function renderVotingIndexSection(entries: VotingIndexEntry[]): string {
  if (entries.length === 0) return "";

  const [year = "", monthName = ""] = entries[0].challenge.split(" - ");
  const parsed = DateTime.fromFormat(`${monthName} ${year}`, "MMMM yyyy", { locale: "en" });
  const monthNum = parsed.isValid ? parsed.toFormat("MM") : "01";
  const header = `=== {{ucfirst:{{ISOdate|${year}-${monthNum}|{{PAGELANGUAGE}}}}}} ===`;

  const lines = [header];
  for (const entry of entries) {
    lines.push(`* [[Commons:Photo challenge/${entry.challenge}/Voting|${entry.challengeCode}]]`);
  }

  return lines.join("\n");
}
