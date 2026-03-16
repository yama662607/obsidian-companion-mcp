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

    assert.match(semanticTool, /TOOL_NAMES\.SEARCH_NOTES_SEMANTIC/);
    assert.match(semanticTool, /indexStatus/);
    assert.match(semanticTool, /Index not ready|No semantic matches/);
    assert.match(semanticService, /getIndexStatus\(/);
    assert.match(semanticService, /pendingCount/);
    assert.match(semanticService, /ready: pendingCount === 0/);
});

test("tool surface uses split note operations instead of generic manage actions", () => {
    const noteTool = read("bridge/src/tools/noteManagement.ts");
    const matrix = read("bridge/src/resources/capabilityMatrix.ts");
    const toolNames = read("bridge/src/constants/toolNames.ts");
    const promptNames = read("bridge/src/constants/promptNames.ts");

    assert.match(noteTool, /TOOL_NAMES\.CREATE_NOTE/);
    assert.match(noteTool, /TOOL_NAMES\.GET_NOTE/);
    assert.match(noteTool, /TOOL_NAMES\.UPDATE_NOTE_CONTENT/);
    assert.match(noteTool, /TOOL_NAMES\.DELETE_NOTE/);
    assert.match(noteTool, /TOOL_NAMES\.UPDATE_NOTE_METADATA/);
    assert.doesNotMatch(noteTool, /"manage_note"/);

    assert.match(matrix, /TOOL_NAME_LIST/);
    assert.match(matrix, /RESOURCE_URI_LIST/);
    assert.match(matrix, /PROMPT_NAME_LIST/);
    assert.match(toolNames, /"create_note"/);
    assert.match(toolNames, /"update_note_metadata"/);
    assert.match(promptNames, /"workflow_agent_runtime_review"/);
});

test("release gate policy includes dual-mcp e2e go/no-go criteria", () => {
    const releaseGate = read("docs/execution/release-gate.md");
    assert.match(releaseGate, /Dual MCP|dual mcp/i);
    assert.match(releaseGate, /Go\/No-Go|GO\/NO-GO|go\/no-go/i);
    assert.match(releaseGate, /severity|重大度|High/i);
});
