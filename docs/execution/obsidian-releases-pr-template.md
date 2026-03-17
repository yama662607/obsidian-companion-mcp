# Obsidian Community Plugins PR Template

Use this when opening a PR to obsidianmd/obsidian-releases.

## Title

Add obsidian-companion-mcp community plugin

## Body

This PR adds Obsidian Companion MCP to community-plugins.json.

Checklist:

- Plugin id in manifest.json: obsidian-companion-mcp
- Repository: https://github.com/yama662607/obsidian-companion-mcp
- Latest release assets attached:
  - main.js
  - manifest.json
  - versions.json
- versions.json includes latest key matching manifest version
- minAppVersion is set and tested on desktop

Entry:

```json
{
  "id": "obsidian-companion-mcp",
  "name": "Obsidian Companion MCP",
  "author": "Daisuke Yamashiki",
  "description": "Enables AI agents to use MCP tools for semantic vault search and editor actions via the companion MCP server.",
  "repo": "yama662607/obsidian-companion-mcp"
}
```
