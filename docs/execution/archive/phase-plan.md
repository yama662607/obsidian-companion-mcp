# Phase Delivery Plan

## Dependency Graph

| Phase | Depends On | Exit Condition |
|---|---|---|
| Phase 0: Baseline | None | Owner matrix + phase template + sign-off template created |
| Phase 1: Governance | Phase 0 | Classification/review checklist published |
| Phase 2: Quality Gates | Phase 1 | Schema/annotation/contract/regression checks implemented |
| Phase 3: Delivery Execution | Phase 2 | Feature implementation follows gate policy |
| Phase 4: Rollout Readiness | Phase 3 | Dry-run + rollback rehearsal evidence approved |

## Session-Sized Tasks Per Phase

### Phase 0

- Build owner matrix and escalation rules.
- Define phase template.
- Add sign-off evidence template.

### Phase 1

- Add Tool/Resource/Prompt classification checklist.
- Add review checklist for naming and single responsibility.
- Add ownership-based approval routing.

### Phase 2

- Implement schema policy checks.
- Implement annotation policy checks.
- Implement contract payload checks.
- Implement regression plan checks.

### Phase 3

- Execute implementation per phase template.
- Block advancement on unmet prerequisites.

### Phase 4

- Run staged rollout dry-run.
- Run rollback rehearsal.
- Publish final go/no-go record.

## Advancement Rule (Blocking)

A phase MUST NOT advance when any of the following are true:

- Any entry/exit criterion remains unchecked.
- Required evidence artifacts are missing.
- Quality gate script reports failure.
- Latest `just check` evidence is missing.

When blocked, next-phase tasks are frozen until remediation is recorded and approved.
