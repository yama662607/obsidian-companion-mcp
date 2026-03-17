export const TOOL_NAMES = {
    SEARCH_NOTES_SEMANTIC: "search_notes_semantic",
    GET_ACTIVE_CONTEXT: "get_active_context",
    INSERT_AT_CURSOR: "insert_at_cursor",
    REPLACE_RANGE: "replace_range",
    CREATE_NOTE: "create_note",
    GET_NOTE: "get_note",
    UPDATE_NOTE_CONTENT: "update_note_content",
    DELETE_NOTE: "delete_note",
    UPDATE_NOTE_METADATA: "update_note_metadata",
} as const;

export const TOOL_NAME_LIST = [
    TOOL_NAMES.SEARCH_NOTES_SEMANTIC,
    TOOL_NAMES.GET_ACTIVE_CONTEXT,
    TOOL_NAMES.INSERT_AT_CURSOR,
    TOOL_NAMES.REPLACE_RANGE,
    TOOL_NAMES.CREATE_NOTE,
    TOOL_NAMES.GET_NOTE,
    TOOL_NAMES.UPDATE_NOTE_CONTENT,
    TOOL_NAMES.DELETE_NOTE,
    TOOL_NAMES.UPDATE_NOTE_METADATA,
];
