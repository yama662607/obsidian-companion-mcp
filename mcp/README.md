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

- `search_notes_semantic`: Meaning-based search that returns bounded excerpts for candidate notes.
- `get_active_context`: Current file and cursor info.
- `insert_at_cursor`: Insert text at current position and return lightweight mutation confirmation.
- `replace_range`: Replace a validated range and return lightweight mutation confirmation.
- `list_notes`: Folder-scoped note and directory listing with bounded pagination.
- `move_note`: Move or rename a note within the vault.
- `get_index_status`: Inspect semantic index readiness and pending work.
- `create_note` / `get_note` / `delete_note`: Standard note operations.
- `update_note_metadata`: YAML frontmatter management.

Recommended workflow for large vaults:

1. Use `list_notes` or `search_notes_semantic` to narrow candidates.
2. Use `get_note` only for notes that need full content.
3. Use `get_index_status` when semantic results may still be incomplete.
