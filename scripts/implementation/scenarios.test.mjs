import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("editor context scenario is implemented in plugin host", () => {
  const source = read("plugin/src/main.ts");
  assert.match(source, /editor\.getContext/);
  assert.match(source, /editor\.applyCommand/);
  assert.match(source, /validateEditorPosition/);
  assert.match(source, /validateEditorRange/);
});

test("editor tools expose degraded and no-active-editor signals", () => {
  const source = read("mcp/src/tools/editorCommands.ts");
  assert.match(source, /degradedReason/);
  assert.match(source, /noActiveEditor/);
  assert.match(source, /No active editor/);
  assert.match(source, /TOOL_NAMES/);
});

test("replace_range degraded mode does not overwrite local content", () => {
  const source = read("mcp/src/domain/editorService.ts");
  assert.match(source, /plugin_unavailable_range_replace_unsupported/);
  assert.doesNotMatch(source, /content:\s*`\$\{text\}`/);
});

test("editor position validation rejects out-of-bounds coordinates", () => {
  const sharedSource = read("shared/editorPositions.ts");
  const pluginSource = read("plugin/src/main.ts");
  const serviceSource = read("mcp/src/domain/editorService.ts");

  assert.match(sharedSource, /exceeds content line count/);
  assert.match(sharedSource, /exceeds line length/);
  assert.match(sharedSource, /Range start must not be after range end/);
  assert.match(pluginSource, /validateEditorPosition/);
  assert.match(pluginSource, /validateEditorRange/);
  assert.match(serviceSource, /validateEditorPosition/);
  assert.match(serviceSource, /validateEditorRange/);
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

test("semantic search returns deterministic structured shape", () => {
  const source = read("mcp/src/tools/semanticSearch.ts");
  assert.match(source, /okResult\(/);
  assert.match(source, /TOOL_NAMES\.SEARCH_NOTES_SEMANTIC/);
  assert.match(source, /matches/);
  assert.match(source, /indexStatus/);
  assert.match(source, /get_note/);
  assert.match(source, /Index not ready|No semantic matches found|Index is empty/);
});

test("note and metadata fallback behavior exists", () => {
  const source = read("mcp/src/domain/noteService.ts");
  assert.match(source, /degraded: true/);
  assert.match(source, /degradedReason/);
  assert.match(source, /updateMetadata/);
  assert.match(source, /notes\.read|notes\.write/);
  assert.match(source, /semanticService\?\.upsert/);
});

test("delete_note missing path returns NOT_FOUND semantics", () => {
  const source = read("mcp/src/domain/noteService.ts");
  assert.match(source, /new DomainError\("NOT_FOUND", `Note not found:/);
  assert.match(source, /throw error/);
  assert.match(source, /deleted:\s*true/);
});

test("fallback storage applies frontmatter for metadata round-trip", () => {
  const source = read("mcp/src/infra/fallbackStorage.ts");
  const sharedSource = read("shared/frontmatter.ts");
  assert.match(source, /applyFrontmatter, hasFrontmatter, parseFrontmatter/);
  assert.match(source, /applyFrontmatter/);
  assert.match(source, /hasFrontmatter\(content\)/);
  assert.match(sharedSource, /value\.length === 0/);
  assert.match(sharedSource, /items\.push\(parseScalar/);
  assert.match(sharedSource, /frontmatterPattern = \/\^\\s\*---\\r\?\\n/);
});

test("plugin metadata updates use shared frontmatter rendering", () => {
  const source = read("plugin/src/main.ts");
  assert.match(source, /applyFrontmatter/);
  assert.doesNotMatch(source, /JSON\.stringify\(v\)/);
});

test("review-bot compatibility avoids fetch, console.log, and hardcoded config dir", () => {
  const pluginClient = read("mcp/src/infra/pluginClient.ts");
  const pluginSource = read("plugin/src/main.ts");
  const serverSource = read("mcp/src/server.ts");
  const providerSource = read("mcp/src/domain/embeddingProvider.ts");

  assert.doesNotMatch(pluginClient, /fetch\(/);
  assert.match(pluginClient, /postJson/);
  assert.match(
    pluginClient,
    /reject\(error instanceof Error \? error : new Error\("Failed to parse plugin response"\)\)/,
  );
  assert.doesNotMatch(pluginSource, /console\.log/);
  assert.match(pluginSource, /console\.debug/);
  assert.match(pluginSource, /ReturnType<typeof http\.createServer>/);
  assert.match(pluginSource, /\.setName\("Server"\)\s*\.setHeading\(\)/);
  assert.match(pluginSource, /new Notice\("Invalid port in settings; using default\."\)/);
  assert.match(pluginSource, /new Notice\("Invalid port number\."\)/);
  assert.match(pluginSource, /new Notice\("Invalid port\. Cannot start server\."\)/);
  assert.match(pluginSource, /new Notice\("Server restarted\."\)/);
  assert.doesNotMatch(serverSource, /"\.obsidian"/);
  assert.doesNotMatch(providerSource, /"\.obsidian"/);
});

test("prompt registrations avoid unnecessary async wrappers", () => {
  const searchPrompt = read("mcp/src/prompts/searchThenInsert.ts");
  const rewritePrompt = read("mcp/src/prompts/contextRewrite.ts");
  const reviewPrompt = read("mcp/src/prompts/agentRuntimeReview.ts");

  assert.doesNotMatch(searchPrompt, /async \(args\) =>/);
  assert.doesNotMatch(rewritePrompt, /async \(args\) =>/);
  assert.doesNotMatch(reviewPrompt, /async \(args\) =>/);
});

test("plugin note operations normalize ENOENT to NOT_FOUND", () => {
  const pluginSource = read("plugin/src/main.ts");

  assert.match(pluginSource, /isMissingVaultFileError/);
  assert.match(
    pluginSource,
    /errorResponse\(id, "NOT_FOUND", `Note not found: \$\{params\.path\}`\)/,
  );
  assert.match(pluginSource, /error\.code === "ENOENT"/);
});

test("implementation e2e defaults to isolated plugin transport", () => {
  const source = read("scripts/implementation/mcp-runtime.e2e.test.mjs");

  assert.match(source, /OBSIDIAN_PLUGIN_PORT: "1"/);
  assert.match(source, /do not talk to a real Obsidian plugin unless a test opts in/);
  assert.match(source, /envOverrides:/);
});

test("fallback storage is anchored to OBSIDIAN_VAULT_PATH", () => {
  const source = read("mcp/src/infra/fallbackStorage.ts");
  assert.match(source, /OBSIDIAN_VAULT_PATH/);
  assert.match(source, /path\.resolve\(vaultRoot, normalized\)/);
  assert.match(source, /Path escapes vault root/);
});

test("delete_note keeps single-responsibility input contract", () => {
  const source = read("mcp/src/tools/noteManagement.ts");
  const schemaSource = read("mcp/src/schemas/notes.ts");
  assert.match(source, /TOOL_NAMES\.DELETE_NOTE/);
  assert.match(schemaSource, /Vault-relative markdown note path to delete/);
  assert.doesNotMatch(source, /TOOL_NAMES\.DELETE_NOTE[\s\S]*action:\s*z\.enum\(/);
});

test("note tools are split by decision unit and include metadata updater", () => {
  const source = read("mcp/src/tools/noteManagement.ts");
  assert.match(source, /TOOL_NAMES\.CREATE_NOTE/);
  assert.match(source, /TOOL_NAMES\.GET_NOTE/);
  assert.match(source, /TOOL_NAMES\.UPDATE_NOTE_CONTENT/);
  assert.match(source, /TOOL_NAMES\.UPDATE_NOTE_METADATA/);
  assert.doesNotMatch(source, /"manage_note"/);
  assert.doesNotMatch(source, /"manage_metadata"/);
});

test("review support modules are registered for agent workflows", () => {
  const serverSource = read("mcp/src/server.ts");
  const resourceSource = read("mcp/src/resources/reviewChecklist.ts");
  const promptSource = read("mcp/src/prompts/agentRuntimeReview.ts");

  assert.match(serverSource, /registerReviewChecklistResource/);
  assert.match(serverSource, /registerAgentRuntimeReviewPrompt/);
  assert.match(resourceSource, /RESOURCE_URIS\.REVIEW_CHECKLIST/);
  assert.match(promptSource, /PROMPT_NAMES\.AGENT_RUNTIME_REVIEW/);
});

test("tool and resource names are centrally managed", () => {
  const capability = read("mcp/src/resources/capabilityMatrix.ts");
  const searchPrompt = read("mcp/src/prompts/searchThenInsert.ts");
  const rewritePrompt = read("mcp/src/prompts/contextRewrite.ts");
  const uris = read("mcp/src/constants/resourceUris.ts");
  const names = read("mcp/src/constants/toolNames.ts");
  const prompts = read("mcp/src/constants/promptNames.ts");

  assert.match(capability, /TOOL_NAME_LIST/);
  assert.match(capability, /RESOURCE_URI_LIST/);
  assert.match(capability, /PROMPT_NAME_LIST/);
  assert.match(searchPrompt, /TOOL_NAMES/);
  assert.match(rewritePrompt, /TOOL_NAMES/);
  assert.match(uris, /runtime:\/\/status/);
  assert.match(names, /search_notes_semantic/);
  assert.match(names, /list_notes/);
  assert.match(names, /move_note/);
  assert.match(names, /get_index_status/);
  assert.match(prompts, /workflow_context_rewrite/);
});

test("note discovery tools use bounded schemas and intent-aligned annotations", () => {
  const source = read("mcp/src/tools/noteManagement.ts");
  assert.match(source, /TOOL_NAMES\.LIST_NOTES/);
  assert.match(source, /TOOL_NAMES\.MOVE_NOTE/);
  assert.match(source, /TOOL_NAMES\.GET_INDEX_STATUS/);
  assert.match(
    source,
    /limit:\s*z[\s\S]*?\.number\(\)[\s\S]*?\.int\(\)[\s\S]*?\.min\(1\)[\s\S]*?\.max\(500\)/,
  );
  assert.match(
    source,
    /pendingSampleLimit:\s*z[\s\S]*?\.number\(\)[\s\S]*?\.int\(\)[\s\S]*?\.min\(1\)[\s\S]*?\.max\(50\)/,
  );
  assert.match(source, /TOOL_NAMES\.LIST_NOTES[\s\S]*readOnlyHint:\s*true/);
  assert.match(source, /TOOL_NAMES\.GET_INDEX_STATUS[\s\S]*readOnlyHint:\s*true/);
});

test("semantic search stores bounded excerpts instead of full note bodies", () => {
  const source = read("mcp/src/domain/semanticService.ts");
  assert.match(source, /function toExcerpt/);
  assert.match(source, /snippet:\s*toExcerpt\(job\.content\)/);
  assert.match(source, /excerpt:\s*toExcerpt\(note\.snippet\)/);
});

test("editor mutation tools return lightweight confirmation payloads", () => {
  const source = read("mcp/src/tools/editorCommands.ts");
  assert.match(source, /const toMutationPayload/);
  assert.doesNotMatch(source, /TOOL_NAMES\.INSERT_AT_CURSOR[\s\S]*content:/);
  assert.doesNotMatch(source, /TOOL_NAMES\.REPLACE_RANGE[\s\S]*content:/);
  assert.match(source, /editorState/);
});

test("plugin supports note move bridge method", () => {
  const source = read("plugin/src/main.ts");
  assert.match(source, /case "notes\.move"/);
  assert.match(source, /"notes\.move"/);
  assert.match(source, /handleNotesMove/);
  assert.match(source, /Destination already exists/);
});
