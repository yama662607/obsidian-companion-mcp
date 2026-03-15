import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { validateContractPayloads } from "../execution/validate-quality-gates.mjs";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

test("handshake and error envelopes satisfy contract policy", () => {
  const fixturePath = path.join(repoRoot, "scripts", "execution", "fixtures", "contract-payloads.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const result = validateContractPayloads(fixture);
  assert.equal(result.ok, true);
});

test("plugin client includes compatibility and degraded-mode transitions", () => {
  const sourcePath = path.join(repoRoot, "bridge", "src", "infra", "pluginClient.ts");
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /Protocol version mismatch/);
  assert.match(source, /this\.availability = "degraded"/);
  assert.match(source, /retryCount/);
});
