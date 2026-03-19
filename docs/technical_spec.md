# Technical Specification: MCP-Plugin Communication

> [!WARNING]
> Historical pre-RPC design note. This document no longer matches the current public runtime surface.
> Use `docs/mcp/*.md` and `docs/execution/runtime-migration-guide.md` for the current contract.

## 1. Communication Protocol
- **Transport**: WebSocket (preferred) or HTTP REST.
- **Port**: Default `13333` (configurable).
- **Format**: JSON-RPC over WebSocket.

## 2. Authentication
- **Mechanism**: API Key.
- **Generation**: The Obsidian Plugin generates a random key on first run and displays it to the user.
- **Exchange**: The MCP must include this key in the `Authorization` header or as a connection parameter.

## 3. Core API Endpoints / Methods

### `get_editor_context`
- **Returns**:
  ```json
  {
    "activeFile": "path/to/note.md",
    "cursor": { "line": 10, "ch": 5 },
    "selection": "highlighted text...",
    "content": "Full unsaved content of the editor..."
  }
  ```

### `search_notes_semantic`
- **Params**: `{ "query": "string", "limit": 10 }`
- **Returns**: Array of matches with scores and snippets.

### `execute_editor_command`
- **Params**:
  ```json
  {
    "command": "insertText" | "replaceRange",
    "text": "...",
    "pos": { "line": 10, "ch": 5 }
  }
  ```

## 4. Semantic Engine Details
- **Core**: `Transformers.js` running in an Obsidian Worker thread.
- **Model**: Default `all-MiniLM-L6-v2` or `intfloat/multilingual-e5-small`.
- **Storage**: LanceDB or a simple SQLite vector extension file stored in the Plugin directory.
