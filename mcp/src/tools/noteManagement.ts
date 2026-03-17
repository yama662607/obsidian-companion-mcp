import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DomainError } from "../domain/errors";
import { okResult, errorResult } from "../domain/toolResult";
import type { NoteService } from "../domain/noteService";
import { TOOL_NAMES } from "../constants/toolNames";

// Define schemas directly in the tool file to ensure Zod instances are preserved
const createNoteInputSchema = z.object({
    path: z.string().describe("Vault-relative path (e.g., 'notes/idea.md')"),
    content: z.string().describe("Full markdown content"),
});

const getNoteInputSchema = z.object({
    path: z.string().describe("Vault-relative path"),
});

const updateNoteContentInputSchema = z.object({
    path: z.string().describe("Vault-relative path"),
    content: z.string().describe("New full content"),
});

const deleteNoteInputSchema = z.object({
    path: z.string().describe("Vault-relative path"),
});

const updateNoteMetadataInputSchema = z.object({
    path: z.string().describe("Vault-relative path"),
    metadata: z.record(z.any()).describe("Key-value pairs for frontmatter"),
});

const refreshSemanticIndexInputSchema = z.object({});

export function registerNoteTool(server: McpServer, noteService: NoteService): void {
    server.registerTool(
        TOOL_NAMES.REFRESH_SEMANTIC_INDEX,
        {
            description: "Scan all markdown files in the vault and update the semantic index.",
            inputSchema: refreshSemanticIndexInputSchema,
        },
        async (params) => {
            try {
                // Ensure params is received, even if empty, to satisfy SDK validation
                const stats = await noteService.refreshIndex();
                const summary = `Scan complete. Found ${stats.totalFound} notes, queued ${stats.updatedCount} for indexing.`;
                return okResult(summary, stats);
            } catch (error) {
                const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "refresh index failed");
                return errorResult(domainError);
            }
        },
    );

    server.registerTool(
        TOOL_NAMES.CREATE_NOTE,
        {
            description: "Create a markdown note at the given vault-relative path.",
            inputSchema: createNoteInputSchema,
        },
        async (params) => {
            try {
                const result = await noteService.write(params.path, params.content);
                return okResult(`Created note (${result.degraded ? "degraded" : "normal"})`, result);
            } catch (error) {
                const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "create note failed");
                return errorResult(domainError);
            }
        },
    );

    server.registerTool(
        TOOL_NAMES.GET_NOTE,
        {
            description: "Read a markdown note content and normalized metadata.",
            inputSchema: getNoteInputSchema,
            annotations: {
                readOnlyHint: true,
            },
        },
        async (params) => {
            try {
                const result = await noteService.read(params.path);
                return okResult(`Read note (${result.degraded ? "degraded" : "normal"})`, result);
            } catch (error) {
                const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "get note failed");
                return errorResult(domainError);
            }
        },
    );

    server.registerTool(
        TOOL_NAMES.UPDATE_NOTE_CONTENT,
        {
            description: "Replace full markdown content of an existing note.",
            inputSchema: updateNoteContentInputSchema,
        },
        async (params) => {
            try {
                const result = await noteService.write(params.path, params.content);
                return okResult(`Updated note content (${result.degraded ? "degraded" : "normal"})`, result);
            } catch (error) {
                const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "update note content failed");
                return errorResult(domainError);
            }
        },
    );

    server.registerTool(
        TOOL_NAMES.DELETE_NOTE,
        {
            description: "Delete a note by path. This operation is destructive.",
            inputSchema: deleteNoteInputSchema,
            annotations: {
                destructiveHint: true,
            },
        },
        async (params) => {
            try {
                const result = await noteService.delete(params.path);
                return okResult(`Deleted note (${result.degraded ? "degraded" : "normal"})`, result);
            } catch (error) {
                const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "delete failed");
                return errorResult(domainError);
            }
        },
    );

    server.registerTool(
        TOOL_NAMES.UPDATE_NOTE_METADATA,
        {
            description: "Patch note metadata/frontmatter with schema-validated key-values.",
            inputSchema: updateNoteMetadataInputSchema,
            annotations: {
                idempotentHint: true,
            },
        },
        async (params) => {
            try {
                const result = await noteService.updateMetadata(params.path, params.metadata);
                return okResult(`Updated metadata (${result.degraded ? "degraded" : "normal"})`, result);
            } catch (error) {
                const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "update metadata failed");
                return errorResult(domainError);
            }
        },
    );
}
