import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RESOURCE_URIS } from "../constants/resourceUris";
import { TOOL_NAMES } from "../constants/toolNames";

export function registerSchemaSummaryResource(server: McpServer): void {
  server.registerResource(
    "schema_summary",
    RESOURCE_URIS.SCHEMA_SUMMARY,
    {
      title: "Tool Input Schemas",
      description: "Summary of strict input schema policy for mcp tools",
      mimeType: "application/json",
    },
    (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(
            {
              policy: {
                requiresZodObject: true,
                requiresOutputSchema: true,
                requiresEnumForFiniteValues: true,
                requiresBoundedLimit: true,
                disallowAny: true,
                prefersReadToEditHandoff: true,
              },
              guidance: {
                preferStructuredArguments: true,
                jsonStringInputsAreSupportedButOptional: true,
                recommendedEditFlow: [
                  TOOL_NAMES.READ_NOTE,
                  TOOL_NAMES.READ_ACTIVE_CONTEXT,
                  TOOL_NAMES.EDIT_NOTE,
                ],
              },
              tools: {
                [TOOL_NAMES.READ_NOTE]: {
                  summary: "Read a persisted note or a specific anchor and receive edit handoff.",
                  input: {
                    note: "Vault-relative note path",
                    anchor: {
                      optional: true,
                      default: { type: "full" },
                      supportedTypes: ["full", "frontmatter", "heading", "block", "line"],
                    },
                    maxChars: {
                      optional: true,
                      default: 50_000,
                      min: 200,
                      max: 100_000,
                    },
                    include: {
                      optional: true,
                      default: {
                        metadata: true,
                        documentMap: false,
                      },
                    },
                  },
                  examples: [
                    {
                      note: "Projects/Alpha/Retro.md",
                    },
                    {
                      note: "Projects/Alpha/Retro.md",
                      anchor: {
                        type: "line",
                        startLine: 120,
                        endLine: 180,
                      },
                      maxChars: 50_000,
                      include: {
                        metadata: false,
                        documentMap: false,
                      },
                    },
                  ],
                },
                [TOOL_NAMES.READ_ACTIVE_CONTEXT]: {
                  summary: "Read the active editor buffer and receive active edit targets.",
                  input: {
                    maxChars: {
                      optional: true,
                      default: 50_000,
                      min: 200,
                      max: 100_000,
                    },
                  },
                  examples: [
                    {},
                    {
                      maxChars: 50_000,
                    },
                  ],
                },
                [TOOL_NAMES.EDIT_NOTE]: {
                  summary:
                    "Apply a structured edit using a target returned by read_note or read_active_context.",
                  input: {
                    target: {
                      required: true,
                      preferredShape: "object",
                      noteSourceExample: {
                        source: "note",
                        note: "Projects/Alpha/Retro.md",
                        anchor: { type: "full" },
                        revision: "rev_abc123",
                        currentText: "# Current content\n",
                      },
                      activeSourceExample: {
                        source: "active",
                        activeFile: "Daily/2026-03-26.md",
                        anchor: {
                          type: "selection",
                          range: {
                            from: { line: 10, ch: 0 },
                            to: { line: 10, ch: 13 },
                          },
                        },
                        revision: null,
                        currentText: "selected text",
                      },
                    },
                    change: {
                      required: true,
                      preferredShape: "object",
                      supportedTypes: [
                        "replaceTarget",
                        "append",
                        "prepend",
                        "insertAtCursor",
                        "replaceText",
                      ],
                    },
                  },
                  examples: {
                    replaceTarget: {
                      target: {
                        source: "note",
                        note: "Projects/Alpha/Retro.md",
                        anchor: { type: "full" },
                        revision: "rev_abc123",
                        currentText: "# Current content\n",
                      },
                      change: {
                        type: "replaceTarget",
                        content: "# Rewritten content\n",
                      },
                    },
                    replaceText: {
                      target: {
                        source: "note",
                        note: "Projects/Alpha/Retro.md",
                        anchor: { type: "full" },
                        revision: "rev_abc123",
                        currentText: "# Current content\n",
                      },
                      change: {
                        type: "replaceText",
                        find: "Current",
                        replace: "Updated",
                        occurrence: "first",
                      },
                    },
                    insertAtCursor: {
                      target: {
                        source: "active",
                        activeFile: "Daily/2026-03-26.md",
                        anchor: {
                          type: "cursor",
                          position: { line: 5, ch: 8 },
                        },
                        revision: null,
                        currentText: "",
                      },
                      change: {
                        type: "insertAtCursor",
                        content: "new text",
                      },
                    },
                  },
                  migrationHints: [
                    "Do not pass natural language in target or change.",
                    "Prefer structured objects over long JSON strings.",
                    "replaceTarget requires change.content, not change.text.",
                    "replaceText requires change.find, change.replace, and change.occurrence.",
                  ],
                },
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
