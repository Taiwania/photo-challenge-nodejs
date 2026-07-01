import { DateTime } from "luxon";

const AOE_UTC_OFFSET_HOURS = 12;

export function getVoteDeadlineUtc(challenge: string): DateTime {
  const [year, monthName] = challenge.split(" - ");
  const challengeStart = DateTime.fromFormat(`1 ${monthName} ${year}`, "d MMMM yyyy", {
    zone: "utc"
  });

  return challengeStart.plus({ months: 2 }).startOf("month").plus({ hours: AOE_UTC_OFFSET_HOURS }).toUTC();
}

export function formatVoteDeadlineUtc(challenge: string): string {
  return getVoteDeadlineUtc(challenge).minus({ hours: AOE_UTC_OFFSET_HOURS }).toFormat("yyyy-MM-dd HH:mm");
}

export function getVoteDeadlineBannerDate(challenge: string): string {
  return getVoteDeadlineUtc(challenge).minus({ hours: AOE_UTC_OFFSET_HOURS }).toFormat("dd MMMM yyyy");
}

export function getVoteDeadlineZoneLabel(): string {
  return "AoE";
}
