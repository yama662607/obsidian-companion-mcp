# @yama662607/obsidian-companion-mcp

MCP server package for Obsidian Companion. This server provides semantic search, editor context awareness, and note management tools to AI agents.

## Installation

### Recommended: Global Installation
Installing globally allows for much faster startup times as it avoids the `npx` network check.

```bash
npm install -g @yama662607/obsidian-companion-mcp
```

### Alternative: npx
```bash
npx @yama662607/obsidian-companion-mcp
```

## Configuration

Set the `OBSIDIAN_VAULT_PATH` environment variable to point to your Obsidian vault.

Example for Claude Desktop:
```json
{
  "command": "obsidian-companion",
  "env": {
    "OBSIDIAN_VAULT_PATH": "/Users/username/Documents/MyVault"
  }
}
```

## Features

- **Multilingual Semantic Search**: Uses `multilingual-e5-small` for high-quality cross-language search.
- **Local Persistence**: Vector index and AI models are stored directly in your vault's plugin directory (`.obsidian/plugins/companion-mcp/`).
- **Degraded Mode**: Works even when Obsidian is closed by accessing the file system directly.

## Usage

AI agents can call the following tools:

- `search_notes_semantic`: Meaning-based search.
- `get_active_context`: Current file and cursor info.
- `insert_at_cursor`: Insert text at current position.
- `create_note` / `get_note` / `delete_note`: Standard note operations.
- `update_note_metadata`: YAML frontmatter management.
