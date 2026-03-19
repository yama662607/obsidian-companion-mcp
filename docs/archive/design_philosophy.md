# Design Philosophy: Obsidian Companion MCP

> [!WARNING]
> Archived design note. The current runtime surface is workflow-oriented and documented under `docs/mcp/*.md`.

## 1. Modular Hybrid Architecture
We separate the "Heavy Thinking" from the "Thin Interface."
- **Why Hybrid?**: MCP servers launched by Agents (Claude/Cursor) are short-lived or isolated. They shouldn't handle heavy, persistent tasks like indexing thousands of files every time they start.
- **Obsidian as the Engine**: We leverage the already-running Obsidian instance. It has the file cache, the UI state, and the user's focus.

## 2. Real-Time Context over Raw Files
Standard MCP servers only see what's on the disk. Our Companion sees what's in the **editor**.
- **The "Invisible" Content**: We prioritize unsaved changes and cursor positions. This allows the AI to act as a true "co-pilot" rather than just a "file editor."

## 3. Modularity and Opt-in Features
- **Excalidraw Isolation**: Visual editing logic remains in a separate CLI (`obsidian-excalidraw-mcp`). This keeps the Companion lightweight and relevant to all Obsidian users.
- **Local-First AI**: We favor local embedding generation (e.g., Transformers.js) to ensure privacy and offline capability, but allow API overrides for speed/quality.

## 4. Stability via MCP
The MCP CLI protects the Agent from Obsidian restarts. If Obsidian closes, the MCP can provide clear error messages or fallback to basic file operations, preventing the Agent from crashing.
