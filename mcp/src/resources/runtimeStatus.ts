import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RESOURCE_URIS } from "../constants/resourceUris";
import type { PluginClient } from "../infra/pluginClient";

export function registerRuntimeStatusResource(server: McpServer, pluginClient: PluginClient): void {
  server.registerResource(
    "runtime_status",
    RESOURCE_URIS.RUNTIME_STATUS,
    {
      title: "Runtime Status",
      description: "MCP runtime availability, retries, and degraded reason",
      mimeType: "application/json",
    },
    (uri) => ({
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
