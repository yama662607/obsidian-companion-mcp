import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerCapabilityMatrixResource(server: McpServer): void {
    server.registerResource(
        "capability_matrix",
        "capability://matrix",
        {
            title: "Capability Matrix",
            description: "Tool/Resource/Prompt classification matrix",
            mimeType: "application/json",
        },
        async (uri) => ({
            contents: [
                {
                    uri: uri.toString(),
                    mimeType: "application/json",
                    text: JSON.stringify(
                        {
                            tools: [
                                "semantic_search",
                                "insert_at_cursor",
                                "replace_range",
                                "create_note",
                                "get_note",
                                "update_note_content",
                                "delete_note",
                                "update_note_metadata",
                            ],
                            resources: [
                                "capability://matrix",
                                "schema://tool-inputs",
                                "fallback://behavior",
                                "context://active-editor",
                                "runtime://status",
                            ],
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
