import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RESOURCE_URIS } from "../constants/resourceUris";

export function registerFallbackBehaviorResource(server: McpServer): void {
    server.registerResource(
        "fallback_behavior",
        RESOURCE_URIS.FALLBACK_BEHAVIOR,
        {
            title: "Fallback Behavior",
            description: "Describes degraded-mode behavior when plugin is unavailable",
            mimeType: "application/json",
        },
         (uri) => ({
            contents: [
                {
                    uri: uri.toString(),
                    mimeType: "application/json",
                    text: JSON.stringify(
                        {
                            degradedMode: {
                                triggers: ["plugin-unreachable", "compatibility-failed"],
                                noteOperations: "vault file-backed fallback",
                                metadataOperations: "vault file-backed fallback",
                                semanticSearch: "unavailable",
                                requiredEnv: ["OBSIDIAN_VAULT_PATH"],
                            },
                        },
                        null,
                        2,
                    ),
                },
            ],
        }),
    );
}
