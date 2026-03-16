import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PluginClient } from "../infra/pluginClient";

export function registerRuntimeStatusResource(server: McpServer, pluginClient: PluginClient): void {
    server.registerResource(
        "runtime_status",
        "runtime://status",
        {
            title: "Runtime Status",
            description: "Bridge runtime availability, retries, and degraded reason",
            mimeType: "application/json",
        },
        async (uri) => ({
            contents: [
                {
                    uri: uri.toString(),
                    mimeType: "application/json",
                    text: JSON.stringify(pluginClient.getRuntimeStatus(), null, 2),
                },
            ],
        }),
    );
}
