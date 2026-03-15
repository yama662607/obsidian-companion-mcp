import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerActiveEditorContextResource(server: McpServer): void {
    server.registerResource(
        "active_editor_context",
        {
            uri: "context://active-editor",
            name: "Active Editor Context",
            description: "Read-only snapshot of active editor state",
            mimeType: "application/json",
        },
        async () => ({
            contents: [
                {
                    uri: "context://active-editor",
                    mimeType: "application/json",
                    text: JSON.stringify(
                        {
                            activeFile: null,
                            cursor: null,
                            selection: "",
                            content: "",
                        },
                        null,
                        2,
                    ),
                },
            ],
        }),
    );
}
