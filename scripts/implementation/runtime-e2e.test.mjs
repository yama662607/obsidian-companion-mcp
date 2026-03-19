import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("runtime wiring connects startup handshake, plugin-first reads, and semantic linkage", () => {
  const server = read("mcp/src/server.ts");
  const editorService = read("mcp/src/domain/editorService.ts");
  const noteService = read("mcp/src/domain/noteService.ts");
  const protocol = read("shared/protocol.ts");
  const plugin = read("plugin/src/main.ts");

  assert.match(server, /await pluginClient\.connect\(/);
  assert.match(server, /new EditorService\(pluginClient\)/);
  assert.match(server, /new NoteService\(pluginClient, semanticService\)/);
  assert.match(server, /Missing required vault path/);
  assert.match(server, /handshake\?\.vaultPath/);
  assert.match(protocol, /vaultPath\?: string/);
  assert.match(plugin, /getVaultBasePath\(\)/);

  assert.match(editorService, /editor\.getContext/);
  assert.match(editorService, /editor\.applyCommand/);
  assert.match(noteService, /semanticService\?\.upsert/);
  assert.match(noteService, /semanticService\?\.remove/);
});

test("search and index runtime now use chunk-oriented semantic responses", () => {
  const searchTools = read("mcp/src/tools/searchTools.ts");
  const semanticService = read("mcp/src/domain/semanticService.ts");

  assert.match(searchTools, /TOOL_NAMES\.SEMANTIC_SEARCH_NOTES/);
  assert.match(searchTools, /indexStatus/);
  assert.match(searchTools, /readHint/);
  assert.match(semanticService, /indexedChunkCount/);
  assert.match(semanticService, /buildSemanticChunks/);
  assert.match(semanticService, /maxPerNote/);
});

test("tool surface centers search, read, edit, and lifecycle intent", () => {
  const readEditTools = read("mcp/src/tools/readEdit.ts");
  const noteTools = read("mcp/src/tools/noteManagement.ts");
  const toolNames = read("mcp/src/constants/toolNames.ts");
  const promptNames = read("mcp/src/constants/promptNames.ts");

  assert.match(readEditTools, /TOOL_NAMES\.READ_NOTE/);
  assert.match(readEditTools, /TOOL_NAMES\.READ_ACTIVE_CONTEXT/);
  assert.match(readEditTools, /TOOL_NAMES\.EDIT_NOTE/);
  assert.match(noteTools, /TOOL_NAMES\.PATCH_NOTE_METADATA/);
  assert.match(noteTools, /TOOL_NAMES\.GET_SEMANTIC_INDEX_STATUS/);
  assert.match(toolNames, /"search_notes"/);
  assert.match(toolNames, /"semantic_search_notes"/);
  assert.match(toolNames, /"edit_note"/);
  assert.match(promptNames, /"workflow_agent_runtime_review"/);
});

test("release gate policy still includes dual-mcp e2e go/no-go criteria", () => {
  const releaseGate = read("docs/execution/release-gate.md");
  assert.match(releaseGate, /Dual MCP|dual mcp/i);
  assert.match(releaseGate, /Go\/No-Go|GO\/NO-GO|go\/no-go/i);
  assert.match(releaseGate, /severity|重大度|High/i);
});
