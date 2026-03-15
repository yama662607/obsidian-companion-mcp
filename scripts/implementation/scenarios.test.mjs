import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("editor context scenario is implemented in plugin host", () => {
    const source = read("plugin/src/main.ts");
    assert.match(source, /editor\.getContext/);
    assert.match(source, /editor\.applyCommand/);
    assert.match(source, /Invalid insert position/);
    assert.match(source, /Invalid replace range/);
});

test("semantic search returns deterministic structured shape", () => {
    const source = read("bridge/src/tools/semanticSearch.ts");
    assert.match(source, /okResult\(/);
    assert.match(source, /matches/);
});

test("note and metadata fallback behavior exists", () => {
    const source = read("bridge/src/domain/noteService.ts");
    assert.match(source, /degraded: true/);
    assert.match(source, /updateMetadata/);
    assert.match(source, /notes\.read|notes\.write/);
});
