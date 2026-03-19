# Excalidraw Edit E2E Report (2026-03-17)

## Scope

- Dual MCP validation with Obsidian Companion MCP and Obsidian Excalidraw MCP
- Excalidraw editability verification (edit + restore)
- Error contract and cross-observability checks

## Findings

### High: Edit workflow works end-to-end (fixed)

Evidence:

- Edit operation
  - Tool: update_elements
  - Input: {filePath: "6_Excalidraw/test.excalidraw.md", patches: [{"id": "wl3eBbsq", "text": "こんにちは E2E_EDIT_MARKER_20260317"}]}
  - Output: Elements updated successfully.
- Edit verification
  - Companion contains marker text
  - Excalidraw elements.text contains marker text
  - Excalidraw text mode contains marker text for id wl3eBbsq
- Restore operation
  - Tool: update_elements
  - Input: {filePath: "6_Excalidraw/test.excalidraw.md", patches: [{"id": "wl3eBbsq", "text": "こんにちは"}]}
  - Output: Elements updated successfully.
- Restore verification (baseline match)
  - totalElements: 3 -> 3
  - textElementsCount: 1 -> 1
  - linkedElementsCount: 1 -> 1

Impact:

- No blocking risk observed for this scenario

Assessment:

- PASS

### High: linkedElementsCount issue fixed

Evidence:

- Previous report (0.1.x): linkedElementsCount = 0
- Current report (latest): linkedElementsCount = 1

Impact:

- Link-related summary consistency improved

Assessment:

- PASS

### Medium: Structured error response confirmed

Evidence:

- Tool: inspect_drawing
- Input: {filePath: "nonexistent/smoke_test.excalidraw.md", mode: "summary"}
- Output includes:
  - isError: true
  - code: E_NOT_FOUND_NOTE
  - message: File not found: ...
  - correlationId: 7917c1af-4f75-4bd8-b341-b13a0d75901f

Impact:

- Error handling is machine-readable and traceable

Assessment:

- PASS

### Low: Excalidraw MCP does not expose Resources

Evidence:

- List resources response: Server does not support resources

Impact:

- runtime status and fallback state cannot be retrieved as resources

Minimum fix proposal:

- Add runtime://status resource to Excalidraw MCP for observability

## Unknowns

- None

## Top 3 Actions

1. Add runtime://status resource to Excalidraw MCP for runtime observability
2. Extend edit/restore coverage to other write tools (for example add_node, delete_elements)
3. Document supported edit boundaries (for example multi-element patch constraints)

## Conclusion

- Verdict: EDITABLE_GO

Reasons:

- update_elements edit succeeded
- marker propagation observable from both Companion and Excalidraw views
- restore succeeded and baseline matched
- structured errors are present
- no cross-consistency contradiction found

## Residual Risks

1. Write tool coverage is partial (only update_elements validated)
2. Concurrent edit conflict behavior is not yet validated

## Overall Assessment

Excalidraw MCP is confirmed as editable (not read-only) under the validated E2E scenario.
Previously reported linkedElementsCount inconsistency is resolved in current validation.
