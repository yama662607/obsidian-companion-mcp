# Obsidian Companion MCP

A hybrid Model Context Protocol (MCP) ecosystem for Obsidian, providing vault-wide semantic intelligence and real-time editor context awareness.

## Architecture

This project consists of two main components:

1.  **Plugin (`/plugin`)**: An Obsidian plugin that handles background indexing, semantic embedding generation, and exposes a local API for real-time editor context (cursor, selection, etc.).
2.  **Bridge (`/bridge`)**: A lightweight Node.js CLI that acts as an MCP server. It proxies requests from AI Agents (like Claude or Cursor) to the Obsidian Plugin.

## Features (Planned)

- **Semantic Search**: Meaning-based search across the entire vault.
- **Editor Context**: AI awareness of the active file, cursor position, and text selection.
- **Note Management**: Standard CRUD operations for Markdown files and Frontmatter.
- **Smart Insertion**: Precise injection of content/links based on the user's current editing position.

## Technical Stack

- **Language**: TypeScript
- **Runtime**: Node.js >= 20
- **Semantic Engine**: Transformers.js (Local) or OpenAI API
- **Communication**: Local WebSocket/HTTP Bridge

## Related Projects

- [obsidian-excalidraw-mcp](../obsidian-excalidraw-mcp): Specialized MCP for visual knowledge management.
