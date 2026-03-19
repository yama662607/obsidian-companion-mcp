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

- `list_notes`: Folder-scoped note and directory listing with bounded pagination.
- `search_notes`: Exact and metadata-aware vault search with read hints.
- `semantic_search_notes`: Meaning-based search that returns bounded chunk results with read hints.
- `read_note`: Read persisted note content, metadata, and edit handoff targets.
- `read_active_context`: Read the active editor buffer and edit handoff targets.
- `edit_note`: Unified edit tool for persisted notes and the active editor.
- `create_note`: Create a markdown note.
- `patch_note_metadata`: Patch YAML frontmatter metadata.
- `move_note`: Move or rename a note within the vault.
- `delete_note`: Delete a note.
- `get_semantic_index_status`: Inspect semantic index readiness and pending work.
- `refresh_semantic_index`: Rebuild the semantic index to completion.

Recommended workflow for large vaults:

1. Use `list_notes`, `search_notes`, or `semantic_search_notes` to narrow candidates.
2. Use `read_note` or `read_active_context` to inspect the exact target.
3. Pass `editTarget` / `editTargets.*` directly into `edit_note` for follow-up edits.
4. Use `get_semantic_index_status` when semantic results may still be incomplete.
