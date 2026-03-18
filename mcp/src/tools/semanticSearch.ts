import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../constants/toolNames";
import { DomainError } from "../domain/errors";
import type { SemanticService } from "../domain/semanticService";
import { errorResult, okResult } from "../domain/toolResult";

const searchNotesSemanticInputSchema = z.object({
  query: z.string().describe("Natural language search query (multilingual)"),
  limit: z.number().optional().default(10).describe("Maximum number of results to return"),
});

export function registerSemanticSearchTool(
  server: McpServer,
  semanticService: SemanticService,
): void {
  server.registerTool(
    TOOL_NAMES.SEARCH_NOTES_SEMANTIC,
    {
      description: "Perform semantic (vector-based) search on your notes.",
      inputSchema: searchNotesSemanticInputSchema,
    },
    async (params) => {
      try {
        const result = await semanticService.searchWithStatus(params.query, params.limit);
        let summary: string;
        let instructions: string | null = null;

        if (result.indexStatus.isEmpty) {
          summary = "❌ Vault has not been indexed yet. Semantic search is unavailable.";
          instructions =
            "Please run the 'refresh_semantic_index' tool. Note: This may take several minutes for large vaults as it downloads models and generates embeddings.";
        } else if (!result.indexStatus.modelReady) {
          summary =
            "⚠️ Semantic model is not loaded. Generating first search result may take a moment.";
          instructions =
            "The model will be loaded from disk on the first search. If you deleted the 'models' directory, you must run 'refresh_semantic_index' to re-download it.";
        } else if (result.matches.length > 0) {
          summary = `✅ Found ${result.matches.length} candidate notes. Use 'get_note' for full content.`;
        } else if (result.indexStatus.ready) {
          summary = "❓ No semantic matches found for this query.";
        } else {
          summary = `⏳ Indexing in progress (${result.indexStatus.pendingCount} notes remaining). Results may be incomplete.`;
        }

        return okResult(summary, {
          ...result,
          instructions,
          degraded: false,
          degradedReason: null,
        });
      } catch (error) {
        // If it's a model not found error, return a clear success result with degraded status
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("Model not found locally")) {
          return okResult("❌ Semantic search unavailable: Model not found locally.", {
            matches: [],
            indexStatus: semanticService.getIndexStatus(),
            instructions: "Please run 'refresh_semantic_index' to download the required models.",
            degraded: true,
            degradedReason: "model_missing",
          });
        }

        const domainError =
          error instanceof DomainError
            ? error
            : new DomainError("INTERNAL", `semantic search failed: ${message}`);
        return errorResult(domainError);
      }
    },
  );
}
