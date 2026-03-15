import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  validateSchemaPolicy,
  validateAnnotationPolicy,
} from "../execution/validate-quality-gates.mjs";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function collectToolSources() {
  const dir = path.join(repoRoot, "bridge", "src", "tools");
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".ts"));
  return files.map((name) => {
    const filePath = path.join(dir, name);
    return {
      filePath: `bridge/src/tools/${name}`,
      source: fs.readFileSync(filePath, "utf8"),
    };
  });
}

test("tool schemas follow strict schema policy", () => {
  const result = validateSchemaPolicy(collectToolSources());
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("tool annotations follow annotation policy", () => {
  const result = validateAnnotationPolicy(collectToolSources());
  assert.equal(result.ok, true, result.errors.join("\n"));
});
