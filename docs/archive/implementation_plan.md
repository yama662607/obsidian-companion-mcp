# Implementation Plan: Obsidian Companion MCP

> [!WARNING]
> Archived planning document. The current runtime surface has changed substantially.
> Use `docs/mcp/*.md`, `docs/execution/test-prompts/*.md`, and `openspec/changes/archive/` for the current design record.

## Overview
A hybrid MCP server and Obsidian plugin that provides vault-wide semantic intelligence, full-note CRUD, and real-time editor context awareness.

## User Review Required
> [!IMPORTANT]
> This project requires the user to install an Obsidian Plugin manually to enable semantic search and real-time context.

## Proposed Changes

### Component 1: Obsidian Plugin (The Indexer & Host)
- **Tech**: TypeScript, Obsidian API.
- **Responsibilities**:
  - **Background Indexing**: Monitor file changes and update vector embeddings.
  - **Semantic Engine**: Generate embeddings locally using `Transformers.js` or via OpenAI API.
  - **Context Provider**: Expose active editor state (cursor, selection) via a local server.
  - **Local Server**: Host a WebSocket or HTTP server (localhost-only) to communicate with the MCP.

### Component 2: MCP MCP (The Interface)
- **Tech**: Node.js, MCP SDK.
- **Responsibilities**:
  - **Stdio Interface**: Standard JSON-RPC interface for AI Agents.
  - **Proxy**: Forward Tool calls from the Agent to the Obsidian Plugin.
  - **Standalone Option**: Maintain a fallback for basic file CRUD if the plugin is not responsive.

### Component 3: Toolset
- `search_notes_semantic`: Meaning-based search across the entire vault.
- `get_active_context`: Retrieve current file, cursor position, and selection.
- `insert_at_cursor`: Insert text precisely where the user is typing.
- `create_note`: Create a markdown note.
- `get_note`: Read normalized note content and metadata.
- `update_note_content`: Replace note content deterministically.
- `delete_note`: Delete a note (destructive).
- `update_note_metadata`: Patch frontmatter/tags with validation.

## Verification Plan
### PHASE 1: MCP-Plugin Communication
- [ ] Create a "Hello World" plugin that opens a WebSocket server.
- [ ] Create a CLI MCP that connects and receives a response.

### PHASE 2: Editor Context
- [ ] Verify `getCursor()` and `getValue()` return accurate unsaved data.
- [ ] Verify `replaceRange()` updates the UI instantly.

### PHASE 3: Semantic Search
- [ ] Implement `Transformers.js` inside the plugin and measure embedding speed.
- [ ] Verify vector search accuracy with a sample of 100 notes.
