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
  assert.match(source, /type:\s*z\.literal\("insertAtCursor"\)/);
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
  assert.match(editorServiceSource, /private getFallbackDegradedReason/);
  assert.match(editorServiceSource, /plugin_validation_fallback_used/);
  assert.match(editorServiceSource, /plugin_conflict_fallback_used/);
  assert.match(editorServiceSource, /plugin_internal_fallback_used/);
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
  assert.match(source, /ready:\s*pendingCount === 0 && modelReady/);
  assert.match(source, /const note = fallback\.readNote\(value\.path\)/);
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
  assert.match(source, /private getFallbackDegradedReason/);
  assert.match(source, /const mergedMetadata = \{ \.\.\.existing\.metadata, \.\.\.metadata \}/);
  assert.match(source, /plugin_validation_fallback_used/);
  assert.match(source, /plugin_conflict_fallback_used/);
  assert.match(source, /plugin_not_found_fallback_used/);
});

test("metadata patch flow merges existing frontmatter instead of replacing it", () => {
  const pluginSource = read("plugin/src/main.ts");
  const fallbackSource = read("mcp/src/infra/fallbackStorage.ts");

  assert.match(
    pluginSource,
    /applyFrontmatter\(content, \{ \.\.\.parseFrontmatter\(content\), \.\.\.metadata \}\)/,
  );
  assert.match(
    fallbackSource,
    /const mergedMetadata = \{ \.\.\.existing\.metadata, \.\.\.metadata \}/,
  );
  assert.match(
    fallbackSource,
    /throw new DomainError\("NOT_FOUND", `Note not found: \$\{path\}`\)/,
  );
});

test("active runtime docs use the current tool surface", () => {
  const activeDocs = [
    "docs/execution/obsidian-plugin-release-and-device-test.md",
    "docs/execution/agent-dual-mcp-review-playbook.md",
    "docs/execution/release-gate.md",
    "docs/execution/tool-surface-hardening-playbook.md",
    "docs/execution/governance-checklists.md",
    "docs/execution/owner-matrix.md",
    "docs/execution/obsidian-community-plugin-publish-guide.md",
    "docs/execution/obsidian-releases-pr-template.md",
    "docs/execution/test-prompts/README.md",
    "docs/execution/test-prompts/master-real-agent.md",
    "docs/execution/test-prompts/discovery-search.md",
    "docs/execution/test-prompts/read-edit-integrity.md",
    "docs/execution/test-prompts/semantic-index-compatibility.md",
    "docs/execution/test-prompts/fallback-degraded-mode.md",
    "docs/execution/test-prompts/dual-mcp-cross-review.md",
  ];

  for (const docPath of activeDocs) {
    const source = read(docPath);
    assert.doesNotMatch(source, /\bget_note\b/);
    assert.doesNotMatch(source, /\bget_active_context\b/);
    assert.doesNotMatch(source, /\bsearch_notes_semantic\b/);
    assert.doesNotMatch(source, /\bupdate_note_metadata\b/);
    assert.doesNotMatch(source, /\bget_index_status\b/);
  }

  const dualReview = read("docs/execution/agent-dual-mcp-review-playbook.md");
  assert.match(dualReview, /\bcompanion-mcp\b/);
  assert.doesNotMatch(dualReview, /\bplugin\s+obsidian-companion-mcp\b/i);
});

test("test prompt pack documents the current public tool surface", () => {
  const promptFiles = [
    "docs/execution/test-prompts/README.md",
    "docs/execution/test-prompts/master-real-agent.md",
    "docs/execution/test-prompts/discovery-search.md",
    "docs/execution/test-prompts/read-edit-integrity.md",
    "docs/execution/test-prompts/semantic-index-compatibility.md",
    "docs/execution/test-prompts/fallback-degraded-mode.md",
    "docs/execution/test-prompts/dual-mcp-cross-review.md",
  ];

  for (const docPath of promptFiles) {
    const source = read(docPath);
    assert.doesNotMatch(source, /\bget_note\b/);
    assert.doesNotMatch(source, /\bget_active_context\b/);
    assert.doesNotMatch(source, /\bsearch_notes_semantic\b/);
    assert.doesNotMatch(source, /\bupdate_note_content\b/);
    assert.doesNotMatch(source, /\binsert_at_cursor\b/);
    assert.doesNotMatch(source, /\breplace_range\b/);
    assert.doesNotMatch(source, /\bupdate_note_metadata\b/);
    assert.doesNotMatch(source, /\bget_index_status\b/);
  }
});

test("package README advertises only the current public tool surface", () => {
  const source = read("mcp/README.md");

  assert.match(source, /\bsearch_notes\b/);
  assert.match(source, /\bsemantic_search_notes\b/);
  assert.match(source, /\bread_note\b/);
  assert.match(source, /\bread_active_context\b/);
  assert.match(source, /\bedit_note\b/);
  assert.match(source, /\bpatch_note_metadata\b/);
  assert.match(source, /\bget_semantic_index_status\b/);
  assert.doesNotMatch(source, /\bget_note\b/);
  assert.doesNotMatch(source, /\bget_active_context\b/);
  assert.doesNotMatch(source, /\bsearch_notes_semantic\b/);
  assert.doesNotMatch(source, /\bupdate_note_content\b/);
  assert.doesNotMatch(source, /\binsert_at_cursor\b/);
  assert.doesNotMatch(source, /\breplace_range\b/);
  assert.doesNotMatch(source, /\bupdate_note_metadata\b/);
  assert.doesNotMatch(source, /\bget_index_status\b/);
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

test("tool result preview avoids implicit object stringification", () => {
  const source = read("mcp/src/domain/toolResult.ts");

  assert.doesNotMatch(source, /return String\(structuredContent\)/);
  assert.match(source, /case "string":/);
  assert.match(source, /case "function":/);
  assert.match(source, /JSON\.stringify\(/);
});

test("mcp README documents the current public tool surface", () => {
  const source = read("mcp/README.md");

  assert.match(source, /`list_notes`/);
  assert.match(source, /`search_notes`/);
  assert.match(source, /`semantic_search_notes`/);
  assert.match(source, /`read_note`/);
  assert.match(source, /`read_active_context`/);
  assert.match(source, /`edit_note`/);
  assert.match(source, /`patch_note_metadata`/);
  assert.match(source, /`get_semantic_index_status`/);
  assert.doesNotMatch(source, /`get_note`/);
  assert.doesNotMatch(source, /`get_active_context`/);
  assert.doesNotMatch(source, /`search_notes_semantic`/);
  assert.doesNotMatch(source, /`update_note_metadata`/);
  assert.doesNotMatch(source, /`get_index_status`/);
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

test("legacy note schema module has been removed", () => {
  assert.equal(fs.existsSync(path.join(repoRoot, "mcp/src/schemas/notes.ts")), false);
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

test("tool result preview avoids generic object stringification", () => {
  const source = read("mcp/src/domain/toolResult.ts");

  assert.match(source, /case "string":/);
  assert.match(source, /case "number":/);
  assert.match(source, /case "boolean":/);
  assert.match(source, /case "bigint":/);
  assert.doesNotMatch(source, /return String\(structuredContent\)/);
});
