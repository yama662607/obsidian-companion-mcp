# Obsidian Companion MCP

A hybrid Model Context Protocol (MCP) ecosystem for Obsidian, providing vault-wide semantic intelligence and real-time editor context awareness.

## Features

- **Multilingual Semantic Search**: Powered by `intfloat/multilingual-e5-small`, allowing high-precision search across Japanese, English, and 100+ other languages.
- **Real-time Editor Context**: AI awareness of the active file, cursor position, and text selection.
- **Smart Note Management**: Precise CRUD operations for Markdown files and Frontmatter.
- **Local-First Architecture**: All embeddings and indexing are performed locally on your machine for maximum privacy.

## MCP Workflow

The public MCP surface is organized around the actual agent workflow:

1. Discover candidate notes
   - `list_notes`
   - `search_notes`
   - `semantic_search_notes`
   - `get_semantic_index_status`
   - `refresh_semantic_index`
2. Read persisted notes or the active editor
   - `read_note`
   - `read_active_context`
3. Apply one structured edit tool
   - `edit_note`
4. Use lifecycle / metadata tools when needed
   - `create_note`
   - `patch_note_metadata`
   - `move_note`
   - `delete_note`

`read_note` and `read_active_context` both return machine-readable edit handoff payloads so agents can move from read to edit without reconstructing anchors manually.

For long persisted notes, prefer `read_note` with `anchor.type = "line"` and follow `readMoreHint` to walk the document in stable line windows. For active editor buffers, rerun `read_active_context` with the same or a larger `maxChars` instead of relying on continuation hints, because the unsaved buffer can change between reads.

## Getting Started

To use Obsidian Companion MCP, you need to set up both the Obsidian plugin and the MCP server.

### 1. Install Obsidian Plugin

1.  **Manual Install**: Copy the contents of `dist/plugin-release` (after running `just build`) to your vault's `.obsidian/plugins/companion-mcp/` directory.
2.  **Enable**: Go to Obsidian Settings -> Community Plugins and enable **Companion MCP**.

### 2. Configure MCP Server

The MCP server acts as a bridge between AI agents and Obsidian.

### Local `.env` For Development

For local development and `just` commands, create a root `.env` file and set:

```bash
OBSIDIAN_VAULT_PATH="/absolute/path/to/your/obsidian/vault"
```

This repository's `justfile` loads `.env` automatically, so commands such as `just plugin-install` can use the configured vault without extra shell prefixes.

#### Recommendation: Global Installation (Fastest)

For the best performance and fastest startup, we recommend installing the package globally:

```bash
npm install -g @yama662607/obsidian-companion-mcp
```

Then, use the `obsidian-companion` command in your MCP configuration.

#### Claude Desktop Configuration

Add the following to your `claude_desktop_config.json`:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

**Using Global Install (Recommended):**
```json
{
  "mcpServers": {
    "obsidian-companion": {
      "command": "obsidian-companion",
      "args": [],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/absolute/path/to/your/obsidian/vault"
      }
    }
  }
}
```

**Using npx (Quick start, but slower):**
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

Create a `.mcp.json` file in your project root or home directory:

```json
{
  "mcpServers": {
    "obsidian-companion": {
      "command": "obsidian-companion",
      "args": [],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/absolute/path/to/your/obsidian/vault"
      }
    }
  }
}
```

#### Codex Configuration (`~/.codex/config.toml`)

```toml
[mcpServers.obsidian-companion]
command = "obsidian-companion"
args = []

[mcpServers.obsidian-companion.env]
OBSIDIAN_VAULT_PATH = "/absolute/path/to/your/obsidian/vault"
```

#### Gemini CLI Configuration (`.gemini/settings.json`)

```json
{
  "mcpServers": {
    "obsidian-companion": {
      "command": "obsidian-companion",
      "args": [],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/absolute/path/to/your/obsidian/vault"
      }
    }
  }
}
```

### Important: OBSIDIAN_VAULT_PATH & Data Storage

The `OBSIDIAN_VAULT_PATH` environment variable is **required**. 

- **Full Mode**: When Obsidian is open and the plugin is active, the server provides real-time editor context (cursor position, active file) and high-performance semantic search.
- **Degraded Mode**: If Obsidian is closed, the server automatically switches to "degraded mode," allowing basic note read/write operations by accessing your vault files directly.
- **Storage**: The semantic model (~110MB) and the vector index are stored inside your vault at `.obsidian/plugins/companion-mcp/`. This ensures your index is portable and specific to each vault.

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

## Architecture

This project consists of two main components:

1.  **Plugin (`/plugin`)**: An Obsidian plugin that handles background indexing, semantic embedding generation, and exposes a local API for real-time editor context.
2.  **MCP (`/mcp`)**: A lightweight Node.js CLI that acts as an MCP server. It proxies requests from AI Agents to the Obsidian Plugin.

## npm Packages

- **Canonical MCP package**: `@yama662607/obsidian-companion-mcp`
- **Plugin package**: `@yama662607/obsidian-companion-plugin`

## Technical Stack

- **Language**: TypeScript
- **Runtime**: Node.js >= 20
- **Semantic Engine**: `intfloat/multilingual-e5-small` (Transformers.js)
- **Communication**: Local Stdio MCP / JSON-RPC
