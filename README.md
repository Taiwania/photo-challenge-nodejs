# Photo Challenge Node.js

English | [繁體中文](README.zh-TW.md)

A Node.js + TypeScript web app for running Wikimedia Commons Photo Challenge workflows.

This project is a practical rewrite of the upstream Python tooling into a web-first workflow built with:
- `express`
- `express-handlebars`
- `mwn`
- `luxon`

It currently supports two main flows:
- Prepare a voting page from submission pages
- Count votes and generate revised voting, result, and winners pages

## Current Features

- Wikimedia Commons login with `mwn`
- Cross-platform credential storage via system keychain when available
- Web UI for starting jobs, tracking progress, and reopening recent runs
- CLI for running the two main workflows directly
- CLI support for list/archive/index maintenance commands
- Fixed output directory under `output/jobs/<job-id>/`
- Artifact preview and download in the browser
- Web publish review with target-page comparison before writing to Commons
- Core output shortcuts for voting, revised, result, and winners pages
- Homepage history showing the latest 3 runs even after app restart
- Parsing and processing of live Commons voting/submission pages
- Vote validation for:
  - voter eligibility
  - duplicate votes
  - unsigned votes
  - self-votes
  - multiple 1st/2nd/3rd-place awards by the same voter
  - late votes after the voting deadline
- Automated regression tests for parser, renderer, and offline workflow fixtures
- Sandbox and live publish modes for the main page-writing workflows
- Line-by-line publish diff view with collapsed unchanged sections

## Requirements

- Node.js `24.14.1`
- npm
- A Wikimedia Commons BotPassword login

## Installation

```bash
npm install
```

## Configuration

Copy the example file and adjust the values for your environment:

```bash
cp .env.example .env
```

Important variables:

- `NAME`: full BotPassword login name such as `MainAccount@BotAppName`
- `BOT_PASSWORD`: BotPassword value
- `PORT`: web server port, default `3000`
- `COMMONS_API_URL`: default Commons API endpoint
- `USER_AGENT`: custom user agent for Wikimedia requests
- `CREDENTIAL_SERVICE_NAME`: keychain service name used by `keytar`

Example:

```env
NAME=Example@ExampleBot
BOT_PASSWORD=Generated from Commons
PORT=3000
COMMONS_API_URL=https://commons.wikimedia.org/w/api.php
USER_AGENT=photo-challenge-nodejs/0.1.0 (local development; contact via Wikimedia Commons user page)
CREDENTIAL_SERVICE_NAME=photo-challenge-nodejs/commons
```

## Running the App

Development mode:

```bash
npm run dev
```

Production build:

```bash
npm run build
npm start
```

The app will start at:

```text
http://localhost:3000
```

## CLI Usage

Run the workflows directly from the terminal:

```bash
npm run cli -- create-voting --challenge "2026 - March - Three-wheelers"
npm run cli -- process-challenge --challenge "2026 - February - Orange"
```

Optional overrides:

```bash
npm run cli -- process-challenge --challenge "2026 - February - Orange" --name "Example@Bot" --bot-password "secret"
```

If `--name` or `--bot-password` are omitted, the CLI falls back to `NAME` and `BOT_PASSWORD` from `.env`.

## Publish Modes

Supported publish behavior:
- `create-voting`: `dry-run`, `sandbox`, `live`
- `process-challenge`: `dry-run`, `sandbox`, `live`
- `archive-pages`: `dry-run`, `live`
- `build-voting-index`: `dry-run` only

Sandbox targets are derived from the main account part before `@` in `NAME`.
For example, `Example@BotApp` publishes to `User:Example/Sandbox/<challenge>/...`.

## Main Workflows

### 1. Prepare voting page

Use this before voting starts.

What it does:
- reads the challenge submission page
- supports inline gallery pages and PrefixIndex-based subpages
- fetches file metadata from Commons
- validates basic submission constraints
- generates a voting page draft

Main outputs:
- `*_voting.txt`
- `*_summary.txt`
- `*_files.json`
- `*_sources.json`

### 2. Count votes and publish results

Use this after voting has happened.

What it does:
- reads the live voting page
- parses files and votes
- validates voters and vote rules
- applies voting deadline checks
- calculates score, support, and rank
- renders revised voting, result, and winners pages

Main outputs:
- `*_revised.txt`
- `*_result.txt`
- `*_winners.txt`
- `*_votes.json`
- `*_summary.txt`

## Output Structure

All generated data is written to:

```text
output/jobs/<job-id>/
```

Each job directory contains:

```text
input/
generated/
logs/
```

Typical files:

```text
output/jobs/<job-id>/input/voting-page.txt
output/jobs/<job-id>/generated/<challenge>_result.txt
output/jobs/<job-id>/generated/<challenge>_winners.txt
output/jobs/<job-id>/logs/job.log
```

## Credential Storage

The app supports saved credentials for local use.

Priority order:
- system keychain via `keytar`
- in-memory fallback for the current process if keychain is unavailable

Platform backends typically are:
- Windows: Credential Manager
- macOS: Keychain
- Linux: Secret Service / libsecret

Notes:
- `.env` is ignored by git and should not be committed
- Bot passwords are safer than using a primary account password
- The homepage can clear a saved password from the local machine

## Persisted Job History

Job history is rebuilt from files under `output/jobs/*/logs/job.log`.

This means:
- the homepage can show recent runs after app restart
- completed and failed jobs can still be reopened later
- result, publish-review, and artifact pages remain accessible if the job output is still on disk

## Project Structure

```text
src/
  cli/
  core/
  infra/
  parsers/
  renderers/
  services/
  web/
  workflows/
```

High-level responsibilities:
- `cli/`: command-line entrypoint and argument parsing
- `core/`: scoring and validation logic
- `infra/`: config, job store, credential store, persisted job history
- `parsers/`: Commons wikitext parsing
- `renderers/`: output page generation
- `services/`: Commons API / `mwn` integration
- `web/`: Express app, routes, controllers, views, static assets
- `workflows/`: end-to-end job orchestration

## Validation and Build

Type-check:

```bash
npm run check
npm run check:test
```

Build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## Project Status

Implemented and working today:
- Web UI for running jobs, tracking progress, previewing outputs, reopening recent runs, and reviewing publishes before write
- CLI for create-voting, process-challenge, list, archive, and voting-index helper commands
- Commons publishing for the main generated pages, with dry-run, sandbox, and live safety boundaries
- Line-by-line publish review in the Web UI before submitting edits
- Persisted job history under output/jobs, including failed jobs
- Offline regression coverage for parser, renderer, CLI, job history, and workflow fixtures

Recommended next steps:
- Implement winner notification and follow-up maintenance workflows from the upstream Python tool
- Expand regression fixtures for more historical page variants and edge-case signatures
- Write deployment and operations docs for running this outside a local single-user setup
- Consider a finer-grained inline word diff inside changed lines on the publish-review screen

## Current Limitations

- The app is currently designed around a local single-user workflow
- Job history depends on files stored under `output/jobs`
- Some historical Commons page format variants may still require parser adjustments

## Repository Notes

Ignored from git:
- `.env`
- `node_modules/`
- `dist/`
- `output/jobs/`
- `upstreams/`

Tracked intentionally:
- `.env.example`
- `output/.gitkeep`
- source code and configuration files

## License / Source Context

This repository is a Node.js rewrite project based on Wikimedia Commons Photo Challenge automation concepts and local upstream analysis.
