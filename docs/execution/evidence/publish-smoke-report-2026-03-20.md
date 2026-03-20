# Publish Smoke Report (2026-03-20)

## Summary

- Overall result: `PASS`
- Scope: post-publish smoke validation against the public npm/plugin release
- Focus:
  - final tool surface visibility
  - `insertAtCursor`
  - `patch_note_metadata` merge behavior
  - `read_note -> edit_note`
  - `read_active_context -> edit_note`

## Published targets

- MCP: `@yama662607/obsidian-companion-mcp@0.3.5`
- Plugin: `@yama662607/obsidian-companion-plugin@0.2.12`

## Results

### Public tool surface

- Only current public tool names were visible.
- Retired names such as `get_note`, `get_active_context`, `update_note_content`, `replace_range`, `insert_at_cursor`, and `update_note_metadata` were not present.
- `edit_note` exposed `insertAtCursor` in the `change.type` schema.

### Persisted note flow

- `create_note` succeeded for a frontmatter-bearing test note.
- `read_note` returned both `editTarget` and `documentEditTarget`.
- `edit_note` with `append` succeeded.
- `edit_note` with `replaceText` succeeded.
- `delete_note` cleaned up the temporary note successfully.

### `patch_note_metadata`

- Existing `tags` were preserved.
- Existing `priority` was preserved.
- Existing `status` was updated from `draft` to `published`.
- New `testedBy` metadata was added.
- Measured behavior matched shallow merge, not frontmatter replacement.

### Active editor flow

- `read_active_context` returned a valid `editTargets.cursor`.
- `edit_note` with `change: { type: "insertAtCursor", ... }` succeeded.
- Cursor insertion changed the active note as expected.
- Preview output reflected the inserted text.

### Compatibility

- Object-form nested arguments worked normally.
- JSON-string compatibility was not revalidated in this smoke run because the runtime client path constrained the tool invocation format.

## Conclusion

The published release behaves as intended for the key regressions that previously diverged between repo state and npm state:

- `insertAtCursor` is present and works in the public release.
- `patch_note_metadata` performs shallow merge in the public release.
- The `search/read/edit` handoff remains intact after publish.
