import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerActiveEditorContextResource(server: McpServer): void {
    server.registerResource(
        "active_editor_context",
        "context://active-editor",
        {
            title: "Active Editor Context",
            description: "Read-only snapshot of active editor state",
            mimeType: "application/json",
        },
        async (uri) => ({
            contents: [
                {
                    uri: uri.toString(),
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
