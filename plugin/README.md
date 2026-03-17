# @yama662607/obsidian-companion-plugin

Obsidian plugin package for Companion MCP integration.

## Installation

Install as an Obsidian community/development plugin build output.

## Usage

- Build the plugin with the project build command.
- Place output artifacts into your Obsidian vault plugin directory.

## MCP Tool Setup

This plugin is the Obsidian-side runtime. AI agents connect to the mcp MCP server, not directly to this plugin package.

1. Build and install both plugin and mcp.
2. Enable the plugin in Obsidian.
3. Configure your agent MCP settings to launch the mcp.

Example MCP server configuration:

```json
{
	"mcpServers": {
		"obsidian-companion": {
			"command": "npx",
			"args": [
				"-y",
				"@yama662607/obsidian-companion-mcp"
			],
			"env": {
				"OBSIDIAN_VAULT_PATH": "/absolute/path/to/YourVault"
			}
		}
	}
}
```

Local mcp path alternative:

```json
{
	"mcpServers": {
		"obsidian-companion": {
			"command": "node",
			"args": [
				"/absolute/path/to/obsidian-companion-mcp/mcp/dist/index.js"
			],
			"env": {
				"OBSIDIAN_VAULT_PATH": "/absolute/path/to/YourVault"
			}
		}
	}
}
```

`OBSIDIAN_VAULT_PATH` is required. All note read/write/delete operations are resolved relative to this vault path, regardless of the directory where the agent process starts. `OBSIDIAN_COMPANION_API_KEY` is no longer required.

Expected tools after successful startup:

- search_notes_semantic
- get_active_context
- insert_at_cursor
- replace_range
- create_note
- get_note
- update_note_content
- delete_note
- update_note_metadata

## Notes

- Exposes editor context and semantic operations to the mcp over local transport.
