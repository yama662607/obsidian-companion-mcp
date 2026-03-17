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

test("semantic search returns deterministic structured shape", () => {
    const source = read("mcp/src/tools/semanticSearch.ts");
    assert.match(source, /okResult\(/);
    assert.match(source, /TOOL_NAMES\.SEARCH_NOTES_SEMANTIC/);
    assert.match(source, /matches/);
    assert.match(source, /indexStatus/);
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
    assert.match(source, /renderFrontmatter/);
    assert.match(source, /applyFrontmatter/);
    assert.match(source, /stripFrontmatter/);
    assert.match(source, /detectEol/);
    assert.match(source, /\^\\s\*---\\r\?\\n/);
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
    assert.match(prompts, /workflow_context_rewrite/);
});
