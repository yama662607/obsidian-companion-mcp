import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("runtime wiring connects startup handshake, plugin-first editor, and semantic linkage", () => {
    const server = read("bridge/src/server.ts");
    const editorService = read("bridge/src/domain/editorService.ts");
    const noteService = read("bridge/src/domain/noteService.ts");

    assert.match(server, /await pluginClient\.connect\(/);
    assert.match(server, /new EditorService\(pluginClient\)/);
    assert.match(server, /new NoteService\(pluginClient, semanticService\)/);

    assert.match(editorService, /pluginClient\.send<.*>\("editor\.getContext"\)/s);
    assert.match(editorService, /editor\.applyCommand/);

    assert.match(noteService, /semanticService\?\.upsert/);
    assert.match(noteService, /semanticService\?\.remove/);
});

test("semantic responses expose index readiness status", () => {
    const semanticTool = read("bridge/src/tools/semanticSearch.ts");
    const semanticService = read("bridge/src/domain/semanticService.ts");

    assert.match(semanticTool, /indexStatus/);
    assert.match(semanticTool, /Index pending|No semantic matches/);
    assert.match(semanticService, /getIndexStatus\(/);
    assert.match(semanticService, /pendingCount/);
    assert.match(semanticService, /ready: pendingCount === 0/);
});

test("release gate policy includes dual-mcp e2e go/no-go criteria", () => {
    const releaseGate = read("docs/execution/release-gate.md");
    assert.match(releaseGate, /Dual MCP|dual mcp/i);
    assert.match(releaseGate, /Go\/No-Go|GO\/NO-GO|go\/no-go/i);
    assert.match(releaseGate, /severity|重大度|High/i);
});
