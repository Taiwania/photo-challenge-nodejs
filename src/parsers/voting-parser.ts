export type VotingChallenge = {
  raw: string;
};

export type VotingFile = {
  num: number;
  fileName: string;
  title: string;
  creator: string;
};

export type ParsedVote = {
  num: number;
  award: 0 | 1 | 2 | 3;
  voter: string;
  creator: string;
  line: string;
  timestamp: string | null;
};

export type ParsedVotingPage = {
  files: VotingFile[];
  votes: ParsedVote[];
};

function stripComments(text: string): string {
  return text.replace(/<!--([\s\S]*?)-->/g, "");
}

function substr(pattern: RegExp, text: string): string {
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function extractSignatureTimestamp(line: string): string | null {
  const match = line.match(/(\d{1,2}:\d{2},\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}\s+\(UTC\))/);
  return match?.[1] ?? null;
}

export function parseVotingChallenges(wikiText: string): VotingChallenge[] {
  const cleaned = stripComments(wikiText);
  const matches = cleaned.matchAll(/Commons:Photo challenge\/([^/]+)\/Voting/g);
  const seen = new Set<string>();
  const challenges: VotingChallenge[] = [];

  for (const match of matches) {
    const raw = match[1]?.trim();
    if (!raw || seen.has(raw)) {
      continue;
    }

    seen.add(raw);
    challenges.push({ raw });
  }

  return challenges;
}

export function parseVotingPage(wikiText: string): ParsedVotingPage {
  const files: VotingFile[] = [];
  const votes: ParsedVote[] = [];

  let num = 0;
  let fileName = "";
  let title = "";
  let creator = "";

  for (const rawLine of wikiText.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.startsWith("===")) {
      num = Number(substr(/<span[^>]*>(\d+)<\/span>/, line) || 0);
      fileName = "";
      title = "";
      creator = "";
      continue;
    }

    if (line.includes("[[File:")) {
      const part = line.replace("[[File:", "").replace(/\[/g, "|").split("|");
      fileName = part[0]?.trim() ?? "";
      if (part.length >= 5) {
        title = part[4]?.trim() ?? "";
      }
      continue;
    }

    if (line.startsWith("<!-- '''C") || line.startsWith("'''C")) {
      creator = substr(/\[\[User:([^|]+)/, line);
      if (num > 0 && fileName) {
        files.push({ num, fileName, title, creator });
      }
      continue;
    }

    if (line.includes("*}}") && fileName !== "Sample-image.svg") {
      const voter = line.includes("[[Special:Contributions/")
        ? substr(/\[\[Special:Contributions\/([^|\]]+)/, line)
        : substr(/\[\[(?:[Uu]ser|[Bb]enutzer|[Uu]suario):([^|\]]+)/, line);
      const awardText = substr(/\{\{(\d)\/3\*\}\}/, line);
      const award = Number(awardText);
      const normalizedLine = line.replace('<span class="signature-talk">{{int:Talkpagelinktext}}</span>', "");
      const timestamp = extractSignatureTimestamp(normalizedLine);

      if ((award === 0 || award === 1 || award === 2 || award === 3) && num > 0) {
        votes.push({
          num,
          award: award as 0 | 1 | 2 | 3,
          voter,
          creator,
          line: normalizedLine,
          timestamp
        });
      }
    }
  }

  return { files, votes };
}
