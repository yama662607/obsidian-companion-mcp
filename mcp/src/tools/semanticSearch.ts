import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { okResult, errorResult } from "../domain/toolResult";
import { DomainError } from "../domain/errors";
import type { SemanticService } from "../domain/semanticService";
import { TOOL_NAMES } from "../constants/toolNames";

export function registerSemanticSearchTool(server: McpServer, semanticService: SemanticService): void {
    server.registerTool(
        TOOL_NAMES.SEARCH_NOTES_SEMANTIC,
        {
            description: "Search notes semantically and return ranked matches with snippets.",
            inputSchema: z.object({
                query: z.string().min(1).describe("Semantic search query text"),
                limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of ranked matches"),
            }),
            annotations: {
                readOnlyHint: true,
            },
        },
        async (params) => {
            try {
                const result = await semanticService.searchWithStatus(params.query, params.limit);
                let summary: string;
                let instructions: string | null = null;

                if (result.matches.length > 0) {
                    summary = `Found ${result.matches.length} matches`;
                } else if (result.indexStatus.isEmpty) {
                    instructions = "Vault has not been indexed yet. Please run 'refresh_semantic_index' tool to create the initial index. (Vaultがまだインデックスされていません。'refresh_semantic_index' ツールを実行して初期インデックスを作成してください)";
                    summary = instructions;
                } else if (result.indexStatus.ready) {
                    summary = "No semantic matches found";
                } else {
                    summary = `Index not ready (${result.indexStatus.pendingCount} pending)`;
                }

                return okResult(summary, {
                    ...result,
                    instructions,
                    degraded: false,
                    degradedReason: null,
                });
            } catch (error) {
                const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "semantic search failed");
                return errorResult(domainError);
            }
        },
    );
}
