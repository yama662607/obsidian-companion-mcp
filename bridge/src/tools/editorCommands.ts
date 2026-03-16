import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { okResult, errorResult } from "../domain/toolResult";
import { DomainError } from "../domain/errors";
import type { EditorService } from "../domain/editorService";
import { positionSchema } from "../schemas/common";
import { TOOL_NAMES } from "../constants/toolNames";

export function registerEditorTools(server: McpServer, editorService: EditorService): void {
    server.registerTool(
        TOOL_NAMES.GET_ACTIVE_CONTEXT,
        {
            description: "Get active file, cursor, selection, and unsaved editor content.",
            inputSchema: z.object({}),
            annotations: {
                readOnlyHint: true,
            },
        },
        async () => {
            try {
                const result = await editorService.getContext();
                const summary = result.noActiveEditor
                    ? `No active editor (${result.degraded ? "degraded" : "normal"})`
                    : `Retrieved active editor context (${result.degraded ? "degraded" : "normal"})`;

                return okResult(summary, {
                    ...result.context,
                    degraded: result.degraded,
                    degradedReason: result.degradedReason,
                    noActiveEditor: result.noActiveEditor,
                });
            } catch (error) {
                const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "context retrieval failed");
                return errorResult(domainError);
            }
        },
    );

    server.registerTool(
        TOOL_NAMES.INSERT_AT_CURSOR,
        {
            description: "Insert text at a validated editor position.",
            inputSchema: z.object({
                text: z.string().describe("Text to insert at cursor position"),
                position: positionSchema,
            }),
        },
        async (params) => {
            try {
                const result = await editorService.insertText(params.text, params.position);
                return okResult(`Text inserted (${result.degraded ? "degraded" : "normal"})`, {
                    ...result.context,
                    degraded: result.degraded,
                    degradedReason: result.degradedReason,
                    noActiveEditor: result.noActiveEditor,
                });
            } catch (error) {
                const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "insert failed");
                return errorResult(domainError);
            }
        },
    );

    server.registerTool(
        TOOL_NAMES.REPLACE_RANGE,
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
                const result = await editorService.replaceRange(params.text, params.range);
                return okResult(`Range replaced (${result.degraded ? "degraded" : "normal"})`, {
                    ...result.context,
                    degraded: result.degraded,
                    degradedReason: result.degradedReason,
                    noActiveEditor: result.noActiveEditor,
                });
            } catch (error) {
                const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "replace failed");
                return errorResult(domainError);
            }
        },
    );
}
