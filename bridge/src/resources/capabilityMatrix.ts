import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerCapabilityMatrixResource(server: McpServer): void {
    server.registerResource(
        "capability_matrix",
        {
            uri: "capability://matrix",
            name: "Capability Matrix",
            description: "Tool/Resource/Prompt classification matrix",
            mimeType: "application/json",
        },
        async () => ({
            contents: [
                {
                    uri: "capability://matrix",
                    mimeType: "application/json",
                    text: JSON.stringify(
                        {
                            tools: ["semantic_search", "insert_at_cursor", "replace_range", "manage_note", "manage_metadata"],
                            resources: ["capability://matrix", "schema://tool-inputs", "fallback://behavior", "context://active-editor"],
                            prompts: ["workflow_context_rewrite", "workflow_search_then_insert"],
                        },
                        null,
                        2,
                    ),
                },
            ],
        }),
    );
}
