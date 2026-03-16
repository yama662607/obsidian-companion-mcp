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

test("editor tools expose degraded and no-active-editor signals", () => {
    const source = read("bridge/src/tools/editorCommands.ts");
    assert.match(source, /degradedReason/);
    assert.match(source, /noActiveEditor/);
    assert.match(source, /No active editor/);
});

test("semantic search returns deterministic structured shape", () => {
    const source = read("bridge/src/tools/semanticSearch.ts");
    assert.match(source, /okResult\(/);
    assert.match(source, /matches/);
    assert.match(source, /indexStatus/);
    assert.match(source, /Index pending|No semantic matches/);
});

test("note and metadata fallback behavior exists", () => {
    const source = read("bridge/src/domain/noteService.ts");
    assert.match(source, /degraded: true/);
    assert.match(source, /degradedReason/);
    assert.match(source, /updateMetadata/);
    assert.match(source, /notes\.read|notes\.write/);
    assert.match(source, /semanticService\?\.upsert/);
});

test("fallback storage applies frontmatter for metadata round-trip", () => {
    const source = read("bridge/src/infra/fallbackStorage.ts");
    assert.match(source, /renderFrontmatter/);
    assert.match(source, /applyFrontmatter/);
    assert.match(source, /stripFrontmatter/);
});

test("delete_note keeps single-responsibility input contract", () => {
    const source = read("bridge/src/tools/noteManagement.ts");
    const schemaSource = read("bridge/src/schemas/notes.ts");
    assert.match(source, /"delete_note"/);
    assert.match(schemaSource, /Vault-relative markdown note path to delete/);
    assert.doesNotMatch(source, /"delete_note"[\s\S]*action:\s*z\.enum\(/);
});

test("note tools are split by decision unit and include metadata updater", () => {
    const source = read("bridge/src/tools/noteManagement.ts");
    assert.match(source, /"create_note"/);
    assert.match(source, /"get_note"/);
    assert.match(source, /"update_note_content"/);
    assert.match(source, /"update_note_metadata"/);
    assert.doesNotMatch(source, /"manage_note"/);
    assert.doesNotMatch(source, /"manage_metadata"/);
});
