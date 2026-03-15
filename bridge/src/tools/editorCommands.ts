import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { okResult, errorResult } from "../domain/toolResult";
import { DomainError } from "../domain/errors";
import type { EditorService } from "../domain/editorService";

const positionSchema = z.object({
    line: z.number().int().min(0),
    ch: z.number().int().min(0),
});

export function registerEditorTools(server: McpServer, editorService: EditorService): void {
    server.registerTool(
        "get_active_context",
        {
            description: "Get active file, cursor, selection, and unsaved editor content.",
            inputSchema: z.object({}),
            annotations: {
                readOnlyHint: true,
            },
        },
        async () => {
            try {
                return okResult("Retrieved active editor context", editorService.getContext());
            } catch (error) {
                const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "context retrieval failed");
                return errorResult(domainError);
            }
        },
    );

    server.registerTool(
        "insert_at_cursor",
        {
            description: "Insert text at a validated editor position.",
            inputSchema: z.object({
                text: z.string().describe("Text to insert at cursor position"),
                position: positionSchema,
            }),
        },
        async (params) => {
            try {
                const context = editorService.insertText(params.text, params.position);
                return okResult("Text inserted", context);
            } catch (error) {
                const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "insert failed");
                return errorResult(domainError);
            }
        },
    );

    server.registerTool(
        "replace_range",
        {
            description: "Replace text in a validated editor range.",
            inputSchema: z.object({
                text: z.string().describe("Replacement text"),
                range: z.object({
                    from: positionSchema,
                    to: positionSchema,
                }),
            }),
        },
        async (params) => {
            try {
                const context = editorService.replaceRange(params.text, params.range);
                return okResult("Range replaced", context);
            } catch (error) {
                const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "replace failed");
                return errorResult(domainError);
            }
        },
    );
}
