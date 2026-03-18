#!/usr/bin/env node

import { logError } from "./infra/logger";
import { runServer } from "./server";

runServer().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logError(`fatal startup error: ${message}`);
  process.exitCode = 1;
});
