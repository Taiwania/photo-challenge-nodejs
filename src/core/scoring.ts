export type ScoredVotingFile = {
  num: number;
  fileName: string;
  title: string;
  creator: string;
  score: number;
  support: number;
  rank: number;
};

export function countVotes(
  files: Array<{ num: number; fileName: string; title: string; creator: string }>,
  votes: Array<{ num: number; award: 0 | 1 | 2 | 3; error: number }>
): ScoredVotingFile[] {
  const validVotes = votes.filter((vote) => vote.error === 0);
  const grouped = new Map<number, { score: number; support: number }>();

  for (const vote of validVotes) {
    const current = grouped.get(vote.num) ?? { score: 0, support: 0 };
    current.score += vote.award;
    current.support += 1;
    grouped.set(vote.num, current);
  }

  const merged = files.map((file) => {
    const stats = grouped.get(file.num) ?? { score: 0, support: 0 };
    return {
      ...file,
      score: stats.score,
      support: stats.support,
      rank: 0
    };
  });

  const maxSupport = Math.max(...merged.map((file) => file.support), 0) + 1;
  merged.sort((a, b) => (b.score + b.support / maxSupport) - (a.score + a.support / maxSupport));

  let previousValue: number | null = null;
  let previousRank = 0;
  for (let index = 0; index < merged.length; index += 1) {
    const file = merged[index];
    const value = file.score + file.support / maxSupport;
    if (previousValue !== null && value === previousValue) {
      file.rank = previousRank;
    } else {
      file.rank = index + 1;
      previousRank = file.rank;
      previousValue = value;
    }
  }

  return merged;
}
