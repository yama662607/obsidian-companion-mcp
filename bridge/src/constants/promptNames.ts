export const PROMPT_NAMES = {
    CONTEXT_REWRITE: "workflow_context_rewrite",
    SEARCH_THEN_INSERT: "workflow_search_then_insert",
    AGENT_RUNTIME_REVIEW: "workflow_agent_runtime_review",
} as const;

export const PROMPT_NAME_LIST = [
    PROMPT_NAMES.CONTEXT_REWRITE,
    PROMPT_NAMES.SEARCH_THEN_INSERT,
    PROMPT_NAMES.AGENT_RUNTIME_REVIEW,
];
