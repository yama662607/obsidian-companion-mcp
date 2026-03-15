# Owner Matrix

## Responsibility Mapping

| Workstream | Primary Owner | Backup Owner | Approval Authority | Scope |
|---|---|---|---|---|
| Bridge | Bridge Maintainer | Platform Maintainer | Integration Lead | MCP server surface, stdio transport, fallback behavior |
| Plugin | Plugin Maintainer | Platform Maintainer | Integration Lead | Obsidian runtime services, editor context, semantic host |
| Integration | Integration Lead | Bridge Maintainer | Release Owner | Bridge-plugin contract, compatibility, handshakes |
| Release | Release Owner | Engineering Manager | Release Owner | Go/no-go decision, rollout orchestration, rollback decision |

## Escalation Rules

- Cross-module defects are assigned by Integration Lead within one working session.
- If bridge and plugin owners disagree on acceptance, Release Owner is tie-breaker.
- High-risk release decisions require explicit sign-off by Release Owner and Integration Lead.
