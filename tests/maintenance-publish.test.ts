import assert from "node:assert/strict";
import { test } from "./harness.js";
import { applyMaintenancePublishEntry, buildMaintenancePublishEntries } from "../src/web/maintenance-publish.js";

const maintenancePlanJson = JSON.stringify({
  primaryChallenge: "2026 - February - Orange",
  notifications: [
    {
      recipient: "Example Winner",
      fileName: "Orange One.jpg",
      rank: 1,
      targetTitle: "User talk:Example Winner",
      sectionHeading: "[[Commons:Photo challenge/2026 - February - Orange/Winners]]",
      bodyText: "{{Photo Challenge Gold|File:Orange One.jpg|Orange|2026|February}}--~~~~",
      editSummary: "Announcing Photo Challenge winners"
    }
  ],
  challengeAnnouncement: {
    targetTitle: "Commons talk:Photo challenge",
    sectionHeading: "[[Commons:Photo challenge|Photo challenge]] February results",
    bodyText: "Announcement body",
    editSummary: "Announcing Photo Challenge winners"
  },
  previousPageUpdate: {
    targetTitle: "Commons:Photo challenge/Previous",
    prependText: "=== Header ===\n{{Winners}}\n",
    editSummary: "Add February winners"
  },
  assessmentPlans: [
    {
      fileTitle: "File:Orange One.jpg",
      templateText: "{{Photo challenge winner|1|Orange|2026|February}}\n\n",
      editSummary: "Assessment added - congratulations"
    }
  ]
}, null, 2);

test("buildMaintenancePublishEntries maps live targets into sandbox pages", () => {
  const entries = buildMaintenancePublishEntries(maintenancePlanJson, "Example User@BotApp", "sandbox");

  assert.equal(entries.find((entry) => entry.type === "notifications")?.targetTitle, "User:Example_User/Sandbox/2026 - February - Orange/Maintenance/Notifications/Example_Winner");
  assert.equal(entries.find((entry) => entry.type === "announcement")?.targetTitle, "User:Example_User/Sandbox/2026 - February - Orange/Maintenance/Announcement");
  assert.equal(entries.find((entry) => entry.type === "previous-page")?.targetTitle, "User:Example_User/Sandbox/2026 - February - Orange/Maintenance/Previous");
  assert.equal(entries.find((entry) => entry.type === "file-assessment")?.targetTitle, "User:Example_User/Sandbox/2026 - February - Orange/Maintenance/File_assessments/Orange_One.jpg");
});

test("applyMaintenancePublishEntry appends new notification sections without duplicating them", () => {
  const entry = buildMaintenancePublishEntries(maintenancePlanJson, "Example User@BotApp", "live").find((item) => item.type === "notifications");
  assert(entry);

  const current = "== Existing ==\nHello";
  const next = applyMaintenancePublishEntry(current, entry);
  const again = applyMaintenancePublishEntry(next, entry);

  assert.match(next, /Photo Challenge Gold/);
  assert.equal(again, next);
});

test("applyMaintenancePublishEntry prepends previous-page content once", () => {
  const entry = buildMaintenancePublishEntries(maintenancePlanJson, "Example User@BotApp", "live").find((item) => item.type === "previous-page");
  assert(entry);

  const current = "=== Older Header ===\n{{Old winners}}";
  const next = applyMaintenancePublishEntry(current, entry);

  assert.equal(next.startsWith("=== Header ==="), true);
  assert.equal(applyMaintenancePublishEntry(next, entry), next);
});

test("applyMaintenancePublishEntry inserts assessment templates before the license section", () => {
  const entry = buildMaintenancePublishEntries(maintenancePlanJson, "Example User@BotApp", "live").find((item) => item.type === "file-assessment");
  assert(entry);

  const current = "Intro\n=={{int:license-header}}==\nLicense text";
  const next = applyMaintenancePublishEntry(current, entry);

  assert.match(next, /Photo challenge winner/);
  assert.match(next, /==\{\{Assessment\}\}==/);
});
