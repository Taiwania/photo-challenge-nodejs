import assert from "node:assert/strict";
import { test } from "./harness.js";
import { buildCliUsage, parseCliArgs } from "../src/cli/index.js";

test("buildCliUsage documents both supported commands", () => {
  const usage = buildCliUsage();

  assert.match(usage, /create-voting/);
  assert.match(usage, /process-challenge/);
  assert.match(usage, /--challenge/);
});

test("parseCliArgs reads command line values directly", () => {
  const parsed = parseCliArgs([
    "create-voting",
    "--challenge",
    "2026 - March - Three-wheelers",
    "--name",
    "Example@Bot",
    "--bot-password",
    "secret"
  ]);

  assert.equal(parsed.kind, "run");
  if (parsed.kind !== "run") {
    throw new Error("Expected run arguments");
  }

  assert.deepEqual(parsed.request, {
    action: "create-voting",
    challenge: "2026 - March - Three-wheelers",
    source: "old",
    credentials: {
      name: "Example@Bot",
      botPassword: "secret"
    },
    publishMode: "dry-run"
  });
});

test("parseCliArgs falls back to environment variables for credentials", () => {
  const parsed = parseCliArgs(
    ["process-challenge", "--challenge", "2026 - February - Orange"],
    {
      NAME: "Env@Bot",
      BOT_PASSWORD: "env-secret"
    }
  );

  assert.equal(parsed.kind, "run");
  if (parsed.kind !== "run") {
    throw new Error("Expected run arguments");
  }

  assert.equal(parsed.request.credentials.name, "Env@Bot");
  assert.equal(parsed.request.credentials.botPassword, "env-secret");
});

test("parseCliArgs returns help when no arguments are provided", () => {
  const parsed = parseCliArgs([]);
  assert.deepEqual(parsed, { kind: "help" });
});

test("parseCliArgs accepts --publish-mode sandbox and live", () => {
  const sandbox = parseCliArgs([
    "create-voting", "--challenge", "2026 - March - Three-wheelers",
    "--name", "Example@Bot", "--bot-password", "secret",
    "--publish-mode", "sandbox"
  ]);
  assert.equal(sandbox.kind, "run");
  if (sandbox.kind !== "run") throw new Error("Expected run");
  assert.equal(sandbox.request.publishMode, "sandbox");

  const live = parseCliArgs([
    "process-challenge", "--challenge", "2026 - February - Orange",
    "--name", "Example@Bot", "--bot-password", "secret",
    "--publish-mode", "live"
  ]);
  assert.equal(live.kind, "run");
  if (live.kind !== "run") throw new Error("Expected run");
  assert.equal(live.request.publishMode, "live");
});

test("parseCliArgs rejects an invalid --publish-mode value", () => {
  assert.throws(
    () => parseCliArgs([
      "create-voting", "--challenge", "2026 - March - Three-wheelers",
      "--name", "Example@Bot", "--bot-password", "secret",
      "--publish-mode", "yolo"
    ]),
    /Invalid --publish-mode/
  );
});

test("parseCliArgs rejects missing required challenge values", () => {
  assert.throws(
    () => parseCliArgs(["create-voting", "--name", "Example@Bot", "--bot-password", "secret"]),
    /Missing required --challenge value/
  );
});

test("parseCliArgs parses list-submitted-challenges as a list command", () => {
  const parsed = parseCliArgs([
    "list-submitted-challenges",
    "--name", "Example@Bot",
    "--bot-password", "secret"
  ]);
  assert.equal(parsed.kind, "list");
  if (parsed.kind !== "list") throw new Error("Expected list");
  assert.equal(parsed.action, "list-submitted-challenges");
  assert.equal(parsed.source, "main");
});

test("parseCliArgs parses list-voting-challenges with --source old", () => {
  const parsed = parseCliArgs([
    "list-voting-challenges",
    "--name", "Example@Bot",
    "--bot-password", "secret",
    "--source", "old"
  ]);
  assert.equal(parsed.kind, "list");
  if (parsed.kind !== "list") throw new Error("Expected list");
  assert.equal(parsed.action, "list-voting-challenges");
  assert.equal(parsed.source, "old");
});

test("parseCliArgs parses archive-pages as a run job without --challenge", () => {
  const parsed = parseCliArgs([
    "archive-pages",
    "--name", "Example@Bot",
    "--bot-password", "secret",
    "--publish-mode", "sandbox"
  ]);
  assert.equal(parsed.kind, "run");
  if (parsed.kind !== "run") throw new Error("Expected run");
  assert.equal(parsed.request.action, "archive-pages");
  assert.equal(parsed.request.challenge, "");
  assert.equal(parsed.request.publishMode, "sandbox");
});

test("parseCliArgs parses build-voting-index as a run job with --source main", () => {
  const parsed = parseCliArgs([
    "build-voting-index",
    "--name", "Example@Bot",
    "--bot-password", "secret",
    "--source", "main"
  ]);
  assert.equal(parsed.kind, "run");
  if (parsed.kind !== "run") throw new Error("Expected run");
  assert.equal(parsed.request.action, "build-voting-index");
  assert.equal(parsed.request.source, "main");
});

test("parseCliArgs rejects an invalid --source value", () => {
  assert.throws(
    () => parseCliArgs([
      "build-voting-index",
      "--name", "Example@Bot",
      "--bot-password", "secret",
      "--source", "nope"
    ]),
    /Invalid --source/
  );
});
