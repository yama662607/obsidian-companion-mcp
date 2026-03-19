import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("tool names are workflow-oriented and legacy edit names are removed", () => {
  const source = read("mcp/src/constants/toolNames.ts");

  assert.match(source, /"search_notes"/);
  assert.match(source, /"semantic_search_notes"/);
  assert.match(source, /"read_note"/);
  assert.match(source, /"read_active_context"/);
  assert.match(source, /"edit_note"/);
  assert.match(source, /"patch_note_metadata"/);
  assert.match(source, /"get_semantic_index_status"/);
  assert.doesNotMatch(source, /"get_note"/);
  assert.doesNotMatch(source, /"get_active_context"/);
  assert.doesNotMatch(source, /"update_note_content"/);
  assert.doesNotMatch(source, /"insert_at_cursor"/);
  assert.doesNotMatch(source, /"replace_range"/);
  assert.doesNotMatch(source, /"update_note_metadata"/);
  assert.doesNotMatch(source, /"get_index_status"/);
});

test("shared contracts define discriminated edit targets and changes", () => {
  const source = read("mcp/src/schemas/toolContracts.ts");

  assert.match(source, /export const editTargetSchema = z\.discriminatedUnion\("source"/);
  assert.match(source, /source:\s*z\.literal\("note"\)/);
  assert.match(source, /source:\s*z\.literal\("active"\)/);
  assert.match(source, /export const editChangeSchema = z\.discriminatedUnion\("type"/);
  assert.match(source, /type:\s*z\.literal\("replaceTarget"\)/);
  assert.match(source, /type:\s*z\.literal\("replaceText"\)/);
  assert.match(source, /jsonStringOr\(noteAnchorSchema, "anchor"\)/);
  assert.match(source, /jsonStringOr\(editTargetSchema, "target"\)/);
  assert.match(source, /jsonStringOr\(editChangeSchema, "change"\)/);
});

test("read/edit tools are unified around edit_target handoff", () => {
  const source = read("mcp/src/tools/readEdit.ts");

  assert.match(source, /TOOL_NAMES\.READ_NOTE/);
  assert.match(source, /TOOL_NAMES\.READ_ACTIVE_CONTEXT/);
  assert.match(source, /TOOL_NAMES\.EDIT_NOTE/);
  assert.match(source, /outputSchema:\s*readNoteOutputSchema/);
  assert.match(source, /outputSchema:\s*readActiveContextOutputSchema/);
  assert.match(source, /outputSchema:\s*editNoteOutputSchema/);
  assert.match(source, /editTarget:/);
  assert.match(source, /documentEditTarget:/);
  assert.match(source, /const editTargets =/);
});

test("active editor read path exposes selectionRange for follow-up edits", () => {
  const pluginSource = read("plugin/src/main.ts");
  const editorServiceSource = read("mcp/src/domain/editorService.ts");
  const resourceSource = read("mcp/src/resources/activeEditorContext.ts");

  assert.match(pluginSource, /selectionRange:/);
  assert.match(pluginSource, /getCursor\("from"\)/);
  assert.match(pluginSource, /getCursor\("to"\)/);
  assert.match(editorServiceSource, /selectionRange:/);
  assert.match(resourceSource, /selectionRange/);
});

test("plugin transport and settings UI preserve review-bot compatibility guards", () => {
  const pluginSource = read("plugin/src/main.ts");
  const pluginClientSource = read("mcp/src/infra/pluginClient.ts");

  assert.match(pluginSource, /interface LocalServerHandle/);
  assert.doesNotMatch(pluginSource, /\bany\b/);
  assert.doesNotMatch(pluginSource, /http\.Server/);
  assert.doesNotMatch(pluginSource, /console\.(log|info)\(/);
  assert.match(pluginSource, /setName\("Server"\)\.setHeading\(\)/);
  assert.doesNotMatch(pluginSource, /setName\(".*settings/i);
  assert.doesNotMatch(pluginSource, /setName\("Companion MCP/i);
  assert.match(pluginClientSource, /reject\(new Error\(`HTTP error! status:/);
  assert.match(
    pluginClientSource,
    /httpRequest\.on\("error", \(error\) => \{\s*reject\(error instanceof Error \? error : new Error\("Plugin request failed"\)\);/s,
  );
});

test("note document helpers resolve anchors, revisions, and exact replacement", () => {
  const source = read("mcp/src/domain/noteDocument.ts");

  assert.match(source, /buildRevisionToken/);
  assert.match(source, /resolveNoteSelection/);
  assert.match(source, /resolveActiveSelection/);
  assert.match(source, /applyEditChange/);
  assert.match(source, /replaceText/);
  assert.match(source, /buildSemanticChunks/);
  assert.match(source, /boundSemanticChunkText/);
});

test("semantic service indexes chunks instead of full-note excerpts", () => {
  const source = read("mcp/src/domain/semanticService.ts");

  assert.match(source, /buildSemanticChunks/);
  assert.match(source, /indexedChunkCount/);
  assert.match(source, /indexedNoteCount/);
  assert.match(source, /chunkIdsByPath/);
  assert.match(source, /boundSemanticChunkText\(value\.snippet\)/);
  assert.doesNotMatch(source, /snippet:\s*toExcerpt/);
});

test("search tools provide lexical and semantic discovery results only", () => {
  const source = read("mcp/src/tools/searchTools.ts");

  assert.match(source, /TOOL_NAMES\.SEARCH_NOTES/);
  assert.match(source, /TOOL_NAMES\.SEMANTIC_SEARCH_NOTES/);
  assert.match(source, /outputSchema:\s*searchNotesOutputSchema/);
  assert.match(source, /outputSchema:\s*semanticSearchOutputSchema/);
  assert.match(source, /readHint/);
  assert.doesNotMatch(source, /get_note/);
});

test("note management keeps lifecycle and metadata concerns separate", () => {
  const source = read("mcp/src/tools/noteManagement.ts");

  assert.match(source, /TOOL_NAMES\.CREATE_NOTE/);
  assert.match(source, /TOOL_NAMES\.PATCH_NOTE_METADATA/);
  assert.match(source, /TOOL_NAMES\.MOVE_NOTE/);
  assert.match(source, /TOOL_NAMES\.DELETE_NOTE/);
  assert.match(source, /TOOL_NAMES\.GET_SEMANTIC_INDEX_STATUS/);
  assert.match(source, /TOOL_NAMES\.REFRESH_SEMANTIC_INDEX/);
  assert.match(source, /Semantic indexing refresh completed/);
  assert.doesNotMatch(source, /TOOL_NAMES\.GET_NOTE/);
  assert.doesNotMatch(source, /TOOL_NAMES\.UPDATE_NOTE_CONTENT/);
  assert.doesNotMatch(source, /TOOL_NAMES\.UPDATE_NOTE_METADATA/);
});

test("note service drains pending semantic work and preserves fallback move reasons", () => {
  const source = read("mcp/src/domain/noteService.ts");

  assert.match(source, /while \(this\.semanticService\.getIndexStatus\(\)\.pendingCount > 0\)/);
  assert.match(source, /plugin_not_found_fallback_used/);
});

test("server wiring registers search, read/edit, and lifecycle tool groups", () => {
  const source = read("mcp/src/server.ts");

  assert.match(source, /registerSearchTools/);
  assert.match(source, /registerReadEditTools/);
  assert.match(source, /registerNoteTools/);
  assert.match(source, /readPackageVersion/);
  assert.doesNotMatch(source, /version:\s*"0\.1\.0"/);
  assert.doesNotMatch(source, /registerEditorTools/);
  assert.doesNotMatch(source, /registerSemanticSearchTool/);
});

test("prompts and capability resources reference the final tool surface", () => {
  const searchPrompt = read("mcp/src/prompts/searchThenInsert.ts");
  const rewritePrompt = read("mcp/src/prompts/contextRewrite.ts");
  const capability = read("mcp/src/resources/capabilityMatrix.ts");

  assert.match(searchPrompt, /TOOL_NAMES\.SEMANTIC_SEARCH_NOTES/);
  assert.match(searchPrompt, /TOOL_NAMES\.READ_ACTIVE_CONTEXT/);
  assert.match(searchPrompt, /TOOL_NAMES\.EDIT_NOTE/);
  assert.match(rewritePrompt, /TOOL_NAMES\.READ_ACTIVE_CONTEXT/);
  assert.match(rewritePrompt, /TOOL_NAMES\.EDIT_NOTE/);
  assert.match(capability, /TOOL_NAME_LIST/);
});

test("fallback storage remains vault-anchored and returns file stats", () => {
  const source = read("mcp/src/infra/fallbackStorage.ts");

  assert.match(source, /OBSIDIAN_VAULT_PATH/);
  assert.match(source, /updatedAt:/);
  assert.match(source, /size:/);
  assert.match(source, /getNoteStat/);
  assert.match(source, /Path escapes vault root/);
});

test("plugin client preserves structured plugin errors", () => {
  const source = read("mcp/src/infra/pluginClient.ts");

  assert.match(source, /if \(error instanceof DomainError\) \{\s*throw error;\s*\}/);
  assert.match(source, /this\.transition\("normal", null, null\);/);
  assert.doesNotMatch(
    source,
    /throw new DomainError\("UNAVAILABLE", "Plugin communication failed"[\s\S]*throw new DomainError\(\s*json\.error\.code/,
  );
});
