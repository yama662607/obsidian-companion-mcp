import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PROMPT_NAME_LIST } from "../constants/promptNames";
import { RESOURCE_URI_LIST, RESOURCE_URIS } from "../constants/resourceUris";
import { TOOL_NAME_LIST } from "../constants/toolNames";

export function registerCapabilityMatrixResource(server: McpServer): void {
  server.registerResource(
    "capability_matrix",
    RESOURCE_URIS.CAPABILITY_MATRIX,
    {
      title: "Capability Matrix",
      description: "Tool/Resource/Prompt classification matrix",
      mimeType: "application/json",
    },
    (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(
            {
              tools: TOOL_NAME_LIST,
              resources: RESOURCE_URI_LIST,
              prompts: PROMPT_NAME_LIST,
            },
            null,
            2,
          ),
        },
      ],
    }),
  );
}
