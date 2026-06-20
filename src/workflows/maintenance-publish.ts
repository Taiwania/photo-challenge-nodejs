import type { WritablePublishMode } from "../core/models.js";
import { getSandboxRootForName } from "./run-job.js";
import { insertAssessmentTemplate, type ChallengeAnnouncement, type FileAssessmentPlan, type PreviousPageUpdatePlan, type WinnerNotification } from "./post-results-maintenance.js";

export type MaintenancePublishMode = WritablePublishMode;

export type MaintenancePlanData = {
  primaryChallenge: string;
  notifications?: WinnerNotification[];
  challengeAnnouncement?: ChallengeAnnouncement | null;
  previousPageUpdate?: PreviousPageUpdatePlan | null;
  assessmentPlans?: FileAssessmentPlan[];
};

export type MaintenancePlanParseResult =
  | { ok: true; plan: MaintenancePlanData }
  | { ok: false; error: string };

type NotificationSection = {
  heading: string;
  bodyText: string;
  recipient: string;
  fileName: string;
};

export type MaintenancePublishEntry = {
  id: string;
  type: "notifications" | "announcement" | "previous-page" | "file-assessment";
  label: string;
  description: string;
  liveTargetTitle: string;
  targetTitle: string;
  editSummary: string;
  excerpt: string[];
  sections?: NotificationSection[];
  prependText?: string;
  templateText?: string;
};

export function parseMaintenancePlan(content: string): MaintenancePlanData | null {
  const result = parseMaintenancePlanResult(content);
  return result.ok ? result.plan : null;
}

export function parseMaintenancePlanResult(content: string): MaintenancePlanParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown JSON parse error";
    return { ok: false, error: `Maintenance plan JSON is invalid: ${message}` };
  }

  try {
    return { ok: true, plan: validateMaintenancePlanData(parsed) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown validation error";
    return { ok: false, error: `Maintenance plan is invalid: ${message}` };
  }
}

export function buildMaintenancePublishEntries(
  content: string,
  loginName: string,
  mode: MaintenancePublishMode
): MaintenancePublishEntry[] {
  const result = parseMaintenancePlanResult(content);
  if (!result.ok) {
    throw new Error(result.error);
  }

  return buildMaintenancePublishEntriesFromPlan(result.plan, loginName, mode);
}

export function buildMaintenancePublishEntriesFromPlan(
  plan: MaintenancePlanData,
  loginName: string,
  mode: MaintenancePublishMode
): MaintenancePublishEntry[] {
  const challenge = plan.primaryChallenge;
  const entries: MaintenancePublishEntry[] = [];
  const groupedNotifications = new Map<string, WinnerNotification[]>();

  for (const notification of plan.notifications ?? []) {
    const bucket = groupedNotifications.get(notification.targetTitle) ?? [];
    bucket.push(notification);
    groupedNotifications.set(notification.targetTitle, bucket);
  }

  for (const [targetTitle, notifications] of [...groupedNotifications.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const recipient = notifications[0]?.recipient ?? targetTitle.replace(/^User talk:/i, "");
    entries.push({
      id: `notifications:${targetTitle}`,
      type: "notifications",
      label: notifications.length > 1 ? "Winner Notifications" : "Winner Notification",
      description: `Prepared ${notifications.length} winner message(s) for ${recipient}.`,
      liveTargetTitle: targetTitle,
      targetTitle: resolveMaintenanceTarget(loginName, challenge, mode, "notifications", recipient),
      editSummary: notifications[0]?.editSummary ?? "Announcing Photo Challenge winners",
      excerpt: notifications.slice(0, 4).map((notification) => `${notification.sectionHeading} -> File:${notification.fileName}`),
      sections: notifications.map((notification) => ({
        heading: notification.sectionHeading,
        bodyText: notification.bodyText,
        recipient: notification.recipient,
        fileName: notification.fileName
      }))
    });
  }

  if (plan.challengeAnnouncement) {
    entries.push({
      id: `announcement:${plan.challengeAnnouncement.targetTitle}`,
      type: "announcement",
      label: "Central Announcement",
      description: "Shared announcement for the paired challenge results.",
      liveTargetTitle: plan.challengeAnnouncement.targetTitle,
      targetTitle: resolveMaintenanceTarget(loginName, challenge, mode, "announcement"),
      editSummary: plan.challengeAnnouncement.editSummary,
      excerpt: [plan.challengeAnnouncement.sectionHeading, ...buildExcerpt(plan.challengeAnnouncement.bodyText, 4)],
      sections: [{
        heading: plan.challengeAnnouncement.sectionHeading,
        bodyText: plan.challengeAnnouncement.bodyText,
        recipient: "",
        fileName: ""
      }]
    });
  }

  if (plan.previousPageUpdate) {
    entries.push({
      id: `previous-page:${plan.previousPageUpdate.targetTitle}`,
      type: "previous-page",
      label: "Previous Page Update",
      description: "Prepend the latest winners block to Commons:Photo challenge/Previous.",
      liveTargetTitle: plan.previousPageUpdate.targetTitle,
      targetTitle: resolveMaintenanceTarget(loginName, challenge, mode, "previous-page"),
      editSummary: plan.previousPageUpdate.editSummary,
      excerpt: buildExcerpt(plan.previousPageUpdate.prependText, 5),
      prependText: plan.previousPageUpdate.prependText
    });
  }

  for (const assessment of plan.assessmentPlans ?? []) {
    const fileName = assessment.fileTitle.replace(/^File:/i, "");
    entries.push({
      id: `file-assessment:${assessment.fileTitle}`,
      type: "file-assessment",
      label: "File Assessment",
      description: `Apply the assessment template to ${assessment.fileTitle}.`,
      liveTargetTitle: assessment.fileTitle,
      targetTitle: resolveMaintenanceTarget(loginName, challenge, mode, "file-assessment", fileName),
      editSummary: assessment.editSummary,
      excerpt: buildExcerpt(assessment.templateText, 4),
      templateText: assessment.templateText
    });
  }

  return entries;
}

function validateMaintenancePlanData(value: unknown): MaintenancePlanData {
  const record = requireRecord(value, "root");

  return {
    primaryChallenge: requireString(record.primaryChallenge, "primaryChallenge"),
    notifications: validateOptionalArray(record.notifications, "notifications", validateWinnerNotification),
    challengeAnnouncement: validateOptionalNullableRecord(record.challengeAnnouncement, "challengeAnnouncement", validateChallengeAnnouncement),
    previousPageUpdate: validateOptionalNullableRecord(record.previousPageUpdate, "previousPageUpdate", validatePreviousPageUpdate),
    assessmentPlans: validateOptionalArray(record.assessmentPlans, "assessmentPlans", validateFileAssessmentPlan)
  };
}

function validateWinnerNotification(value: unknown, path: string): WinnerNotification {
  const record = requireRecord(value, path);
  return {
    recipient: requireString(record.recipient, `${path}.recipient`),
    fileName: requireString(record.fileName, `${path}.fileName`),
    rank: requireNumber(record.rank, `${path}.rank`),
    targetTitle: requireString(record.targetTitle, `${path}.targetTitle`),
    sectionHeading: requireString(record.sectionHeading, `${path}.sectionHeading`),
    bodyText: requireString(record.bodyText, `${path}.bodyText`),
    editSummary: requireString(record.editSummary, `${path}.editSummary`)
  };
}

function validateChallengeAnnouncement(value: unknown, path: string): ChallengeAnnouncement {
  const record = requireRecord(value, path);
  return {
    targetTitle: requireString(record.targetTitle, `${path}.targetTitle`),
    sectionHeading: requireString(record.sectionHeading, `${path}.sectionHeading`),
    bodyText: requireString(record.bodyText, `${path}.bodyText`),
    editSummary: requireString(record.editSummary, `${path}.editSummary`)
  };
}

function validatePreviousPageUpdate(value: unknown, path: string): PreviousPageUpdatePlan {
  const record = requireRecord(value, path);
  return {
    targetTitle: requireString(record.targetTitle, `${path}.targetTitle`),
    prependText: requireString(record.prependText, `${path}.prependText`),
    editSummary: requireString(record.editSummary, `${path}.editSummary`)
  };
}

function validateFileAssessmentPlan(value: unknown, path: string): FileAssessmentPlan {
  const record = requireRecord(value, path);
  return {
    fileTitle: requireString(record.fileTitle, `${path}.fileTitle`),
    templateText: requireString(record.templateText, `${path}.templateText`),
    editSummary: requireString(record.editSummary, `${path}.editSummary`)
  };
}

function validateOptionalArray<T>(
  value: unknown,
  path: string,
  validateItem: (item: unknown, path: string) => T
): T[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array.`);
  }

  return value.map((item, index) => validateItem(item, `${path}[${index}]`));
}

function validateOptionalNullableRecord<T>(
  value: unknown,
  path: string,
  validateValue: (item: unknown, path: string) => T
): T | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return validateValue(value, path);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new Error(`${path} must be an object.`);
}

function requireString(value: unknown, path: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new Error(`${path} must be a non-empty string.`);
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  throw new Error(`${path} must be a finite number.`);
}

export function applyMaintenancePublishEntry(currentContent: string | null, entry: MaintenancePublishEntry): string {
  if (entry.type === "notifications" || entry.type === "announcement") {
    const sections = entry.sections ?? [];
    return appendSections(currentContent ?? "", sections);
  }

  if (entry.type === "previous-page") {
    return prependBlock(currentContent ?? "", entry.prependText ?? "");
  }

  return insertAssessmentTemplate(currentContent ?? "", entry.templateText ?? "");
}

function appendSections(currentContent: string, sections: NotificationSection[]): string {
  let next = currentContent.trimEnd();

  for (const section of sections) {
    if (next.includes(section.bodyText.trim())) {
      continue;
    }

    const block = [`== ${section.heading} ==`, section.bodyText].join("\n").trimEnd();
    next = next ? `${next}\n\n${block}` : block;
  }

  return next;
}

function prependBlock(currentContent: string, prependText: string): string {
  const trimmedBlock = prependText.trimEnd();
  if (!trimmedBlock) {
    return currentContent;
  }

  if (currentContent.includes(trimmedBlock)) {
    return currentContent;
  }

  const trimmedCurrent = currentContent.trimStart();
  return trimmedCurrent ? `${trimmedBlock}\n${trimmedCurrent}` : trimmedBlock;
}

function resolveMaintenanceTarget(
  loginName: string,
  challenge: string,
  mode: MaintenancePublishMode,
  type: MaintenancePublishEntry["type"],
  key = ""
): string {
  if (mode === "live") {
    if (type === "notifications") return `User talk:${key}`;
    if (type === "announcement") return "Commons talk:Photo challenge";
    if (type === "previous-page") return "Commons:Photo challenge/Previous";
    return `File:${key}`;
  }

  const root = `${getSandboxRootForName(loginName)}/${challenge}/Maintenance`;
  if (type === "notifications") return `${root}/Notifications/${toPageSegment(key)}`;
  if (type === "announcement") return `${getSandboxRootForName(loginName)}/Photo Challenge talk page Annoucement`;
  if (type === "previous-page") return `${root}/Previous`;
  return `${root}/File_assessments/${toPageSegment(key)}`;
}

function toPageSegment(value: string): string {
  return value
    .trim()
    .replace(/^File:/i, "")
    .replace(/^User talk:/i, "")
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/[^\w().,-]+/g, "_") || "entry";
}

function buildExcerpt(content: string, maxLines: number): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, maxLines);
}
