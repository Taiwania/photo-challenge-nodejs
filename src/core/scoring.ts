import type { EntryMode, ScoredVotingEntry, VotingEntry, VotingEntryMemberRole } from "./models.js";

type LegacyVotingFile = {
  num: number;
  fileName: string;
  title: string;
  creator: string;
};

/**
 * Phase 1 compatibility shape. Renderers and maintenance will consume the
 * entry-oriented members directly in later phases.
 */
export type ScoredVotingFile = {
  num: number;
  fileName: string;
  title: string;
  creator: string;
  score: number;
  support: number;
  rank: number;
  mode?: EntryMode;
  members?: ScoredVotingEntry["members"];
};

function isVotingEntry(value: VotingEntry | LegacyVotingFile): value is VotingEntry {
  return "members" in value;
}

function toScoringEntry(value: VotingEntry | LegacyVotingFile): {
  num: number;
  mode: EntryMode;
  members: Array<{ role: VotingEntryMemberRole; fileName: string; title: string; creator: string }>;
  creator: string;
} {
  if (!isVotingEntry(value)) {
    return {
      num: value.num,
      mode: "single",
      members: [{ role: "submission", fileName: value.fileName, title: value.title, creator: value.creator }],
      creator: value.creator
    };
  }

  const members = value.members.flatMap((member) => member.fileName
    ? [{
        role: member.role,
        fileName: member.fileName,
        title: member.title,
        creator: member.user ?? ""
      }]
    : []);
  const creator = members.find((member) => member.role === "submission")?.creator ?? "";
  return { num: value.num ?? 0, mode: value.mode, members, creator };
}

export function countVotes(
  entries: Array<VotingEntry | LegacyVotingFile>,
  votes: Array<{ num: number; award: 0 | 1 | 2 | 3; error: number }>
): Array<ScoredVotingEntry & ScoredVotingFile> {
  const validVotes = votes.filter((vote) => vote.error === 0);
  const grouped = new Map<number, { score: number; support: number }>();

  for (const vote of validVotes) {
    const current = grouped.get(vote.num) ?? { score: 0, support: 0 };
    current.score += vote.award;
    current.support += 1;
    grouped.set(vote.num, current);
  }

  const merged = entries.map((entry) => {
    const normalized = toScoringEntry(entry);
    const stats = grouped.get(normalized.num) ?? { score: 0, support: 0 };
    const representative = normalized.members.find((member) => member.role === "submission") ?? normalized.members[0];
    return {
      ...normalized,
      fileName: representative?.fileName ?? "",
      title: representative?.title ?? "",
      score: stats.score,
      support: stats.support,
      rank: 0
    };
  });

  const maxSupport = Math.max(...merged.map((entry) => entry.support), 0) + 1;
  merged.sort((a, b) => (b.score + b.support / maxSupport) - (a.score + a.support / maxSupport));

  let previousValue: number | null = null;
  let previousRank = 0;
  for (let index = 0; index < merged.length; index += 1) {
    const entry = merged[index];
    const value = entry.score + entry.support / maxSupport;
    if (previousValue !== null && value === previousValue) {
      entry.rank = previousRank;
    } else {
      entry.rank = index + 1;
      previousRank = entry.rank;
      previousValue = value;
    }
  }

  return merged;
}
