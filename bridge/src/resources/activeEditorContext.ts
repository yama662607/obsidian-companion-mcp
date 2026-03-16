import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EditorService } from "../domain/editorService";
import { RESOURCE_URIS } from "../constants/resourceUris";

export function registerActiveEditorContextResource(server: McpServer, editorService: EditorService): void {
    server.registerResource(
        "active_editor_context",
        RESOURCE_URIS.ACTIVE_EDITOR_CONTEXT,
        {
            title: "Active Editor Context",
            description: "Read-only snapshot of active editor state",
            mimeType: "application/json",
        },
        async (uri) => {
            const result = await editorService.getContext();

            return {
                contents: [
                    {
                        uri: uri.toString(),
                        mimeType: "application/json",
                        text: JSON.stringify(
                            {
                                ...result.context,
                                degraded: result.degraded,
                                degradedReason: result.degradedReason,
                                noActiveEditor: result.noActiveEditor,
                            },
                            null,
                            2,
                        ),
                    },
                ],
            };
        },
    );
}
