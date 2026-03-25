# Changelog

## v0.3.7

- Hardened `read_note` continuation hints with explicit `reason` and `returnedCompleteLines`
- Improved `full` reads so follow-up windows restart from the next fully returned line and retry partially returned lines
- Clarified `edit_note.previewMeta` semantics with additive `changed*` and `context*` fields
- Raised `read_active_context` defaults to match `read_note` for large-buffer reads
- Updated public docs and E2E coverage for line-window reading and bounded edit previews

## v0.3.6

- Compact output for `read_note`, `read_active_context`, `edit_note`, and `search_notes`
- Added explicit `line` anchor guidance for sequential note reading
- `readMoreHint` now advances by the same line window for `line` anchors
- Bounded metadata, document maps, edit previews, and lexical snippets to keep responses small
