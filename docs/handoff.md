# Handoff Guide for the Next Agent

## Context
You are tasked with implementing the **Obsidian Companion MCP**.
The architecture is a **Hybrid** one:
1.  **Plugin**: Lives inside Obsidian. Does the heavy lifting.
2.  **Bridge**: Lives in Node.js. Talks to the Agent.

## Immediate Next Steps
1.  **Plugin Prototype**: Implement a basic WebSocket server inside `plugin/main.ts`.
2.  **Bridge Prototype**: Implement a simple MCP server in `bridge/src/index.ts` that connects to the Plugin's WebSocket.
3.  **Semantic Search**: Research the best way to run `Transformers.js` in Obsidian's limited environment (Worker threads are recommended).

## Reference Materials
- [Architecture](architecture.md)
- [Implementation Plan](implementation_plan.md)
- [Design Philosophy](design_philosophy.md)
- [Technical Spec](technical_spec.md)

## Status of Siblings
- `obsidian-excalidraw-mcp`: Fully functional standalone CLI. Do not merge into this project unless explicitly asked.
