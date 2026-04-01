import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const projectRoot = process.cwd();

export const config = {
  port: Number(process.env.PORT ?? 3000),
  projectRoot,
  outputRoot: path.join(projectRoot, "output", "jobs"),
  commonsApiUrl: process.env.COMMONS_API_URL ?? "https://commons.wikimedia.org/w/api.php",
  userAgent:
    process.env.USER_AGENT ??
    "photo-challenge-nodejs/0.1.0 (local development; contact via Wikimedia Commons user page)",
  credentialServiceName: process.env.CREDENTIAL_SERVICE_NAME ?? "photo-challenge-nodejs/commons"
};
