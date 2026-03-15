# Release Gate Policy

## Required Inputs

- Latest successful `just check` evidence file: `docs/execution/evidence/just-check-latest.json`
- Quality gate script result: `node scripts/execution/validate-quality-gates.mjs`
- Phase sign-off evidence for active phase

## Gate Outcome Rules

Release gate is PASS only when all required inputs are present and successful.

Gate is FAIL when any check fails or evidence is missing.

## Failure Handling (Task 5.3)

On gate failure:

1. Freeze next-phase progression immediately.
2. Open remediation item with owner and due date.
3. Re-run `just check` and quality gate script after remediation.
4. Resume progression only after approval record is updated.
