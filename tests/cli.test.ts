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
    credentials: {
      name: "Example@Bot",
      botPassword: "secret"
    }
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

test("parseCliArgs rejects missing required challenge values", () => {
  assert.throws(
    () => parseCliArgs(["create-voting", "--name", "Example@Bot", "--bot-password", "secret"]),
    /Missing required --challenge value/
  );
});
