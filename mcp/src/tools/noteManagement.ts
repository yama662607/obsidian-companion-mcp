import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DomainError } from "../domain/errors";
import { okResult, errorResult } from "../domain/toolResult";
import type { NoteService } from "../domain/noteService";
import { TOOL_NAMES } from "../constants/toolNames";
import {
    createNoteInputSchema,
    getNoteInputSchema,
    updateNoteContentInputSchema,
    deleteNoteInputSchema,
    updateNoteMetadataInputSchema,
} from "../schemas/notes";

export function registerNoteTool(server: McpServer, noteService: NoteService): void {
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
