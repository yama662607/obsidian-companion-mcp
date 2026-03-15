## Why

The project already has architecture, technical, and implementation documents, but they are not yet translated into OpenSpec artifacts that drive executable work. We need a concrete, dependency-ordered plan so implementation can start with clear scope, measurable checkpoints, and stable interfaces between the Obsidian plugin and MCP bridge.

## What Changes

- Define the bridge-to-plugin protocol contract (transport, auth, request/response, error handling) as a first-class capability.
- Define the MCP interface model to separate Tools, Resources, and Prompts by responsibility, not by backend API shape.
- Define editor-context capabilities for reading active note state and performing precise in-editor edits.
- Define semantic indexing and search capabilities optimized for Obsidian's long-lived runtime.
- Define note and metadata management capabilities with a bridge fallback path when plugin services are unavailable.
- Convert existing planning documents into implementation-ready design and task breakdown with phased verification gates.

## Capabilities

### New Capabilities
- `plugin-bridge-protocol`: Localhost-only, authenticated JSON-RPC communication between bridge and plugin with resilient reconnect behavior.
- `mcp-interface-modeling`: Clear classification and registration rules for Tools, Resources, and Prompts, including schema and annotation conventions.
- `editor-context-operations`: Access active file, cursor, selection, unsaved content, and perform precise insert/replace commands.
- `semantic-vault-search`: Background indexing, embedding generation, and ranked semantic retrieval across vault notes.
- `note-metadata-management`: CRUD for markdown notes and frontmatter/tag updates, including validation and plugin-unavailable fallback behavior.

### Modified Capabilities
- None. No existing OpenSpec capability requirements are being changed.

## Impact

- Affected code: `plugin/` runtime services, local server host, editor adapters, indexing pipeline; `bridge/` MCP server, transport client, tool handlers, resources/prompts registration, fallback mode.
- Affected APIs: bridge tool surface (`semantic_search`, context/editor operations, note/metadata operations), MCP resources/prompts surface, and internal plugin RPC methods.
- Dependencies/systems: Obsidian API, MCP SDK, WebSocket stack, embedding provider (`Transformers.js` with optional API override), vector storage implementation.
- Operational impact: adds phased validation for communication, MCP contract quality (schema/annotation/error shape), editor accuracy, and semantic quality before full rollout.
