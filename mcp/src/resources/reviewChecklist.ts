import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RESOURCE_URIS } from "../constants/resourceUris";

export function registerReviewChecklistResource(server: McpServer): void {
    server.registerResource(
        "review_checklist",
        RESOURCE_URIS.REVIEW_CHECKLIST,
        {
            title: "Agent Review Checklist",
            description: "Read-only checklist for runtime and MCP contract review",
            mimeType: "application/json",
        },
        async (uri) => ({
            contents: [
                {
                    uri: uri.toString(),
                    mimeType: "application/json",
                    text: JSON.stringify(
                        {
                            checklist: [
                                "Tool names and descriptions are intent-first and unambiguous",
                                "Input schemas are strict z.object with bounded fields",
                                "Dangerous operations use destructiveHint and narrow input",
                                "Responses include structuredContent and actionable degradedReason",
                                "Runtime status and fallback behavior are observable via resources",
                                "Prompt guidance references current tool names and expected outputs",
                            ],
                        },
                        null,
                        2,
                    ),
                },
            ],
        }),
    );
}
