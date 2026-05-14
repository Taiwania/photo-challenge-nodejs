import { DateTime } from "luxon";

export function getVoteDeadlineUtc(challenge: string): DateTime {
  const [year, monthName] = challenge.split(" - ");
  const challengeStart = DateTime.fromFormat(`1 ${monthName} ${year}`, "d MMMM yyyy", {
    zone: "utc"
  });

  return challengeStart.plus({ months: 2 }).startOf("month").toUTC();
}

export function formatVoteDeadlineUtc(challenge: string): string {
  return getVoteDeadlineUtc(challenge).toFormat("yyyy-MM-dd HH:mm");
}

export function getVoteDeadlineBannerDate(challenge: string): string {
  return getVoteDeadlineUtc(challenge).toFormat("dd MMMM yyyy");
}

export function getVoteDeadlineZoneLabel(): string {
  return "UTC";
}
