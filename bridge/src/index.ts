import { runServer } from "./server";
import { logError } from "./infra/logger";

runServer().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logError(`fatal startup error: ${message}`);
  process.exitCode = 1;
});
