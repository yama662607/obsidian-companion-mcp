# @yama662607/obsidian-companion-plugin

Obsidian plugin package for Companion MCP integration. This plugin serves as the Obsidian-side runtime for semantic indexing and editor context.

## Installation

1. Build the plugin: `just build`
2. Copy `dist/plugin-release/*` to `[YourVault]/.obsidian/plugins/companion-mcp/`
3. Enable "Companion MCP" in Obsidian settings.

## Data Storage

This plugin creates a data directory at `.obsidian/plugins/companion-mcp/` within your vault to store:
- **`data/semantic-index.json`**: The cached vector embeddings for your notes.
- **`models/`**: The local AI model files (`multilingual-e5-small`) used for semantic search.

This ensures your semantic index is portable and remains private within your vault.

## Compatibility

- **Minimum Obsidian Version**: 1.5.0
- **Supported Platforms**: Desktop (macOS, Windows, Linux)

## Related MCP Server

This plugin is designed to work with the `@yama662607/obsidian-companion-mcp` server package. See the root README for configuration instructions for AI agents.
