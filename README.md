# Obsidian Companion MCP

A hybrid Model Context Protocol (MCP) ecosystem for Obsidian, providing vault-wide semantic intelligence and real-time editor context awareness.

## Getting Started

To use Obsidian Companion MCP, you need to set up both the Obsidian plugin and the MCP server.

### 1. Install Obsidian Plugin

1.  **Manual Install**: Copy the contents of `dist/plugin-release` (after running `just build`) to your vault's `.obsidian/plugins/companion-mcp/` directory.
2.  **Enable**: Go to Obsidian Settings -> Community Plugins and enable **Companion MCP**.

### 2. Configure MCP Server

The MCP server acts as a bridge between AI agents (like Claude Desktop) and Obsidian.

#### Claude Desktop Configuration

Add the following to your `claude_desktop_config.json`:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "obsidian-companion": {
      "command": "npx",
      "args": ["-y", "@yama662607/obsidian-companion-mcp"],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/absolute/path/to/your/obsidian/vault"
      }
    }
  }
}
```

#### Claude Code (CLI) Configuration

Create a `.mcp.json` file in your project root or home directory with the following content:

```json
{
  "mcpServers": {
    "obsidian-companion": {
      "command": "npx",
      "args": ["-y", "@yama662607/obsidian-companion-mcp"],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/absolute/path/to/your/obsidian/vault"
      }
    }
  }
}
```

*Note: Claude Code will automatically detect and load servers defined in `.mcp.json` when started in that directory.*

#### Codex Configuration

Add the following to your `~/.codex/config.toml`:

```toml
[mcpServers.obsidian-companion]
command = "npx"
args = ["-y", "@yama662607/obsidian-companion-mcp"]

[mcpServers.obsidian-companion.env]
OBSIDIAN_VAULT_PATH = "/absolute/path/to/your/obsidian/vault"
```

#### Gemini CLI Configuration

Add the following to your `.gemini/settings.json` (project-level) or `~/.gemini/settings.json` (user-level):

```json
{
  "mcpServers": {
    "obsidian-companion": {
      "command": "npx",
      "args": ["-y", "@yama662607/obsidian-companion-mcp"],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/absolute/path/to/your/obsidian/vault"
      }
    }
  }
}
```

### Important: OBSIDIAN_VAULT_PATH

The `OBSIDIAN_VAULT_PATH` environment variable is **required**. 

- **Full Mode**: When Obsidian is open and the plugin is active, the server provides real-time editor context (cursor position, active file) and high-performance semantic search.
- **Degraded Mode**: If Obsidian is closed, the server automatically switches to "degraded mode," allowing basic note read/write operations by accessing your vault files directly via the file system.

## Architecture

This project consists of two main components:

1.  **Plugin (`/plugin`)**: An Obsidian plugin that handles background indexing, semantic embedding generation, and exposes a local API for real-time editor context (cursor, selection, etc.).
2.  **MCP (`/mcp`)**: A lightweight Node.js CLI that acts as an MCP server. It proxies requests from AI Agents (like Claude or Cursor) to the Obsidian Plugin.

## npm Packages

- **Canonical MCP package**: `@yama662607/obsidian-companion-mcp`
- **Plugin package**: `@yama662607/obsidian-companion-plugin`

`@yama662607/obsidian-companion-bridge` is deprecated and kept only as a migration alias.

## Features (Planned)

- **Semantic Search**: Meaning-based search across the entire vault.
- **Editor Context**: AI awareness of the active file, cursor position, and text selection.
- **Note Management**: Standard CRUD operations for Markdown files and Frontmatter.
- **Smart Insertion**: Precise injection of content/links based on the user's current editing position.

## Technical Stack

- **Language**: TypeScript
- **Runtime**: Node.js >= 20
- **Semantic Engine**: Transformers.js (Local) or OpenAI API
- **Communication**: Local WebSocket/HTTP MCP

## Ecosystem & Synergy

Obsidian Companion MCP is part of a growing ecosystem designed to give AI agents full access to your knowledge base.

### Better Together: Companion + Excalidraw

While this project focuses on text-based notes and semantic intelligence, we highly recommend using it alongside:

- **[Obsidian Excalidraw MCP](https://github.com/yama662607/obsidian-excalidraw-mcp)**: A specialized MCP for managing visual diagrams, sketches, and spatial relationships within your vault.

**Why use them together?**
AI agents perform best when they have a holistic view of your work. By enabling both MCPs, your agent can:
1.  **Search & Read** your text notes for context.
2.  **Visualize & Edit** your diagrams to map out complex ideas.
3.  **Synthesize** connections between visual models and text documentation.

This combination transforms your Obsidian vault into a truly unified, multi-modal knowledge environment for AI collaboration.
