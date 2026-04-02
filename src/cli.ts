import { runCli } from "./cli/index.js";

void runCli().then((exitCode) => {
  process.exitCode = exitCode;
});
