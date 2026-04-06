import assert from "node:assert/strict";
import { test } from "./harness.js";
import type { ScoredVotingFile } from "../src/core/scoring.js";
import {
  buildChallengeAnnouncement,
  buildFileAssessmentPlans,
  buildPreviousPageUpdate,
  buildWinnerNotifications,
  insertAssessmentTemplate
} from "../src/workflows/post-results-maintenance.js";

const orangeTopThree: ScoredVotingFile[] = [
  { num: 8, fileName: "Woman in traditional orange attire at Jaipur Literature Festival.jpg", title: "Woman in traditional orange attire at Jaipur Literature Festival", creator: "Amitash", score: 34, support: 14, rank: 1 },
  { num: 130, fileName: "Tibetan orange cat.jpg", title: "Tibetan orange cat", creator: "Poco a poco", score: 23, support: 10, rank: 2 },
  { num: 54, fileName: "Orange on black.jpg", title: "Orange on black", creator: "VulpesVulpes42", score: 20, support: 8, rank: 3 }
];

const firstAidTopThree: ScoredVotingFile[] = [
  { num: 2, fileName: "First aid training.jpg", title: "First aid training", creator: "MedicOne", score: 17, support: 7, rank: 1 },
  { num: 5, fileName: "First aid kit at station.jpg", title: "First aid kit at station", creator: "BlueSunrise", score: 13, support: 6, rank: 2 },
  { num: 9, fileName: "Volunteer first aid team.jpg", title: "Volunteer first aid team", creator: "Quickresponse", score: 10, support: 5, rank: 3 }
];

test("buildWinnerNotifications mirrors the upstream talk-page template structure", () => {
  const notifications = buildWinnerNotifications("2026 - February - Orange", orangeTopThree);

  assert.equal(notifications.length, 3);
  assert.equal(notifications[0]?.targetTitle, "User talk:Amitash");
  assert.equal(notifications[0]?.sectionHeading, "[[Commons:Photo challenge/2026 - February - Orange/Winners]]");
  assert.match(notifications[0]?.bodyText ?? "", /^\{\{Photo Challenge Gold\|File:Woman in traditional orange attire at Jaipur Literature Festival\.jpg\|Orange\|2026\|February\}\}--~~~~$/);
});

test("buildChallengeAnnouncement combines two winners pages and congratulates the six podium authors", () => {
  const announcement = buildChallengeAnnouncement([
    { challenge: "2026 - February - Orange", files: orangeTopThree },
    { challenge: "2026 - February - First aid", files: firstAidTopThree }
  ]);

  assert.equal(announcement.targetTitle, "Commons talk:Photo challenge");
  assert.equal(announcement.sectionHeading, "[[Commons:Photo challenge|Photo challenge]] February results");
  assert.match(announcement.bodyText, /\{\{Commons:Photo challenge\/2026 - February - Orange\/Winners\|height=240\}\}/);
  assert.match(announcement.bodyText, /Congratulations to \[\[User:Amitash\|\]\], \[\[User:Poco a poco\|\]\], \[\[User:VulpesVulpes42\|\]\], \[\[User:MedicOne\|\]\], \[\[User:BlueSunrise\|\]\] and \[\[User:Quickresponse\|\]\]--~~~~/);
});

test("buildPreviousPageUpdate prepends the monthly winners section", () => {
  const update = buildPreviousPageUpdate([
    "2026 - February - Orange",
    "2026 - February - First aid"
  ]);

  assert.equal(update.targetTitle, "Commons:Photo challenge/Previous");
  assert.match(update.prependText, /^=== \{\{ucfirst:\{\{ISOdate\|2026-02\|\{\{PAGELANGUAGE\}\}\}\}\}\} ===/);
  assert.match(update.prependText, /\{\{Commons:Photo challenge\/2026 - February - Orange\/Winners\}\}/);
  assert.equal(update.editSummary, "Add February winners");
});

test("buildFileAssessmentPlans creates top-three file templates for both challenges", () => {
  const plans = buildFileAssessmentPlans([
    { challenge: "2026 - February - Orange", files: orangeTopThree },
    { challenge: "2026 - February - First aid", files: firstAidTopThree }
  ]);

  assert.equal(plans.length, 6);
  assert.equal(plans[0]?.fileTitle, "File:Woman in traditional orange attire at Jaipur Literature Festival.jpg");
  assert.equal(plans[0]?.templateText, "{{Photo challenge winner|1|Orange|2026|February}}\n\n");
  assert.equal(plans[5]?.templateText, "{{Photo challenge winner|3|First aid|2026|February}}\n\n");
});

test("insertAssessmentTemplate follows the upstream insertion markers", () => {
  const viaLicense = insertAssessmentTemplate(
    "Lead\n=={{int:license-header}}==\nLicense text",
    "{{Photo challenge winner|1|Orange|2026|February}}\n\n"
  );
  assert.match(viaLicense, /==\{\{Assessment\}\}==\n\{\{Photo challenge winner\|1\|Orange\|2026\|February\}\}\n\n==\{\{int:license-header\}\}==/);

  const viaCategory = insertAssessmentTemplate(
    "Lead\n[[Category:Example]]",
    "{{Photo challenge winner|2|Orange|2026|February}}\n\n"
  );
  assert.match(viaCategory, /==\{\{Assessment\}\}==\n\{\{Photo challenge winner\|2\|Orange\|2026\|February\}\}\n\n\[\[Category:Example\]\]/);
});
