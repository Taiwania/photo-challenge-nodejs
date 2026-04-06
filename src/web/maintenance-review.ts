type MaintenanceArtifactType = "maintenance-plan" | "notifications" | "announcement" | "previous-page" | "file-assessments";

export type MaintenanceReviewEntry = {
  type: MaintenanceArtifactType;
  label: string;
  description: string;
  fileName: string;
  targetTitle: string | null;
  heading: string | null;
  summary: string;
  excerpt: string[];
};

export function summarizeMaintenanceArtifact(fileName: string, content: string): MaintenanceReviewEntry | null {
  if (fileName.endsWith("_maintenance_plan.json")) {
    const plan = safeParseJson(content) as {
      mode?: string;
      primaryChallenge?: string;
      pairedChallenge?: string | null;
      sourceJobs?: Array<{ challenge?: string; jobId?: string }>;
      notifications?: unknown[];
      assessmentPlans?: unknown[];
      challengeAnnouncement?: unknown | null;
      previousPageUpdate?: unknown | null;
    } | null;

    if (!plan) {
      return null;
    }

    const sources = Array.isArray(plan.sourceJobs) ? plan.sourceJobs : [];
    const notifications = Array.isArray(plan.notifications) ? plan.notifications.length : 0;
    const assessments = Array.isArray(plan.assessmentPlans) ? plan.assessmentPlans.length : 0;
    const challengeCount = sources.length;
    const pairedLabel = plan.pairedChallenge ? `Paired challenge: ${plan.pairedChallenge}` : "Paired challenge: none";

    return {
      type: "maintenance-plan",
      label: "Maintenance Plan",
      description: "Combined dry-run plan for follow-up maintenance work.",
      fileName,
      targetTitle: null,
      heading: null,
      summary: `${challengeCount} source challenge(s), ${notifications} winner notification(s), ${assessments} assessment edit(s).`,
      excerpt: [
        `Publish mode: ${plan.mode ?? "dry-run"}`,
        `Primary challenge: ${plan.primaryChallenge ?? "(unknown)"}`,
        pairedLabel,
        `Challenge announcement: ${plan.challengeAnnouncement ? "planned" : "not planned"}`,
        `Previous page update: ${plan.previousPageUpdate ? "planned" : "not planned"}`,
        ...sources.slice(0, 3).map((source) => `Source: ${source.challenge ?? "(unknown)"} <- ${source.jobId ?? "(unknown job)"}`)
      ]
    };
  }

  if (fileName.endsWith("_winner_notifications.txt")) {
    const targets = extractTaggedValues(content, "Target");
    const headings = extractTaggedValues(content, "Heading");
    return {
      type: "notifications",
      label: "Winner Notifications",
      description: "Talk-page messages prepared for podium winners.",
      fileName,
      targetTitle: targets[0] ?? null,
      heading: headings[0] ?? null,
      summary: `${targets.length} notification target(s) prepared.`,
      excerpt: buildExcerpt(content, 8)
    };
  }

  if (fileName.endsWith("_challenge_announcement.txt")) {
    const targets = extractTaggedValues(content, "Target");
    const headings = extractTaggedValues(content, "Heading");
    return {
      type: "announcement",
      label: "Central Announcement",
      description: "Combined Commons talk announcement for the paired challenges.",
      fileName,
      targetTitle: targets[0] ?? null,
      heading: headings[0] ?? null,
      summary: `Announcement prepared for ${targets[0] ?? "the target page"}.`,
      excerpt: buildExcerpt(content, 8)
    };
  }

  if (fileName.endsWith("_previous_page_update.txt")) {
    const firstHeading = content.split(/\r?\n/).map((line) => line.trim()).find((line) => line.startsWith("=="));
    return {
      type: "previous-page",
      label: "Previous Page Update",
      description: "Text intended to be prepended to Commons:Photo challenge/Previous.",
      fileName,
      targetTitle: "Commons:Photo challenge/Previous",
      heading: firstHeading ?? null,
      summary: "Prepend block prepared for the Previous page.",
      excerpt: buildExcerpt(content, 8)
    };
  }

  if (fileName.endsWith("_file_assessments.json")) {
    const plans = safeParseJson(content) as Array<{ title?: string; targetTitle?: string }> | null;
    if (!plans) {
      return null;
    }

    return {
      type: "file-assessments",
      label: "File Assessments",
      description: "Edit plans for adding assessment templates to top-ranked files.",
      fileName,
      targetTitle: plans[0]?.targetTitle ?? plans[0]?.title ?? null,
      heading: null,
      summary: `${plans.length} file assessment edit(s) prepared.`,
      excerpt: plans.slice(0, 5).map((plan) => plan.targetTitle ?? plan.title ?? "(unknown file)")
    };
  }

  return null;
}

function extractTaggedValues(content: string, tag: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(`${tag}:`))
    .map((line) => line.slice(tag.length + 1).trim())
    .filter(Boolean);
}

function buildExcerpt(content: string, maxLines: number): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, maxLines);
}

function safeParseJson(content: string): unknown | null {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}
