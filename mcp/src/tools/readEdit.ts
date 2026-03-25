import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TOOL_NAMES } from "../constants/toolNames";
import type { EditorService } from "../domain/editorService";
import { DomainError } from "../domain/errors";
import {
  applyEditChange,
  buildDocumentMap,
  buildRevisionToken,
  compareExpectedRevision,
  compareExpectedText,
  readTitleFromPath,
  replaceResolvedSelection,
  resolveActiveSelection,
  resolveNoteSelection,
} from "../domain/noteDocument";
import type { NoteService } from "../domain/noteService";
import {
  boundStructuredValue,
  RESPONSE_ARRAY_MAX_ITEMS,
  RESPONSE_EXCERPT_MAX_CHARS,
  truncateText,
} from "../domain/responseBounds";
import { errorResult, okResult } from "../domain/toolResult";
import {
  editNoteInputSchema,
  editNoteOutputSchema,
  readActiveContextInputSchema,
  readActiveContextOutputSchema,
  readNoteInputSchema,
  readNoteOutputSchema,
} from "../schemas/toolContracts";

function toIsoDate(value: number): string {
  return new Date(value).toISOString();
}

function extractTags(metadata: Record<string, unknown>): string[] {
  const rawTags = metadata.tags;
  if (Array.isArray(rawTags)) {
    return rawTags.filter((value): value is string => typeof value === "string");
  }
  if (typeof rawTags === "string" && rawTags.trim().length > 0) {
    return [rawTags];
  }
  return [];
}

function toMutationSummary(status: "applied" | "noOp", degraded: boolean): string {
  const mode = degraded ? "degraded" : "normal";
  return status === "noOp" ? `No edit applied (${mode})` : `Edit applied (${mode})`;
}

function anchorToText(anchor: {
  type: string;
  headingPath?: string[];
  blockId?: string;
  startLine?: number;
  endLine?: number;
}): string {
  switch (anchor.type) {
    case "heading":
      return `heading:${anchor.headingPath?.join(" > ") ?? ""}`;
    case "block":
      return `block:${anchor.blockId ?? ""}`;
    case "line":
      return `line:${anchor.startLine ?? 0}-${anchor.endLine ?? 0}`;
    case "frontmatter":
      return "frontmatter";
    case "full":
      return "full";
    default:
      return anchor.type;
  }
}

function previewText(text: string, maxChars = 240): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return truncateText(normalized, maxChars).text;
}

function boundTags(tags: string[]): { tags: string[]; truncated: boolean } {
  const bounded = tags
    .slice(0, RESPONSE_ARRAY_MAX_ITEMS)
    .map((tag) => truncateText(tag, RESPONSE_EXCERPT_MAX_CHARS));
  return {
    tags: bounded.map((tag) => tag.text),
    truncated: tags.length > RESPONSE_ARRAY_MAX_ITEMS || bounded.some((tag) => tag.truncated),
  };
}

function boundFrontmatter(frontmatter: Record<string, unknown>): {
  frontmatter: Record<string, unknown>;
  truncated: boolean;
} {
  const bounded = boundStructuredValue(frontmatter);
  return {
    frontmatter:
      bounded.value && typeof bounded.value === "object" && !Array.isArray(bounded.value)
        ? (bounded.value as Record<string, unknown>)
        : {},
    truncated: bounded.truncated,
  };
}

function boundDocumentMap(documentMap: ReturnType<typeof buildDocumentMap> | null): {
  documentMap: ReturnType<typeof buildDocumentMap> | null;
  truncated: boolean;
} {
  if (!documentMap) {
    return { documentMap: null, truncated: false };
  }

  const headings = documentMap.headings.slice(0, 100);
  const blocks = documentMap.blocks.slice(0, 100);
  const frontmatterFields = documentMap.frontmatterFields.slice(0, 50);

  return {
    documentMap: {
      headings,
      blocks,
      frontmatterFields,
    },
    truncated:
      documentMap.headings.length > headings.length ||
      documentMap.blocks.length > blocks.length ||
      documentMap.frontmatterFields.length > frontmatterFields.length,
  };
}

function buildMutationPreview(beforeText: string, afterText: string) {
  const before = truncateText(beforeText, RESPONSE_EXCERPT_MAX_CHARS);
  const after = truncateText(afterText, RESPONSE_EXCERPT_MAX_CHARS);

  return {
    preview: {
      before: before.text,
      after: after.text,
    },
    previewMeta: {
      beforeTotalChars: before.totalChars,
      afterTotalChars: after.totalChars,
      beforeTruncated: before.truncated,
      afterTruncated: after.truncated,
    },
  };
}

function buildReadMoreHint(
  note: string,
  resolved: ReturnType<typeof resolveNoteSelection>,
  maxChars: number,
  contentTruncated: boolean,
) {
  if (resolved.anchor.type === "line") {
    const windowSize = resolved.anchor.endLine - resolved.anchor.startLine + 1;
    const nextStartLine = resolved.anchor.endLine + 1;
    if (nextStartLine > resolved.totalLines - 1) {
      return null;
    }

    return {
      note,
      anchor: {
        type: "line" as const,
        startLine: nextStartLine,
        endLine: Math.min(nextStartLine + windowSize - 1, resolved.totalLines - 1),
      },
      maxChars,
    };
  }

  if (!contentTruncated) {
    return null;
  }

  return {
    note,
    anchor: resolved.anchor,
    maxChars: Math.min(maxChars * 2, 20_000),
  };
}

export function registerReadEditTools(
  server: McpServer,
  noteService: NoteService,
  editorService: EditorService,
): void {
  server.registerTool(
    TOOL_NAMES.READ_NOTE,
    {
      description:
        "Read part or all of a persisted Obsidian note and return a follow-up edit target.",
      inputSchema: readNoteInputSchema,
      outputSchema: readNoteOutputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    async (params) => {
      try {
        const result = await noteService.read(params.note);
        const revision = buildRevisionToken(params.note, result.updatedAt, result.size);
        const resolved = resolveNoteSelection(result.content, params.anchor);
        const truncated = truncateText(resolved.text, params.maxChars);
        const boundedTags = boundTags(extractTags(result.metadata));
        const boundedFrontmatter = boundFrontmatter(result.metadata);
        const metadata =
          params.include.metadata === false
            ? null
            : {
                tags: boundedTags.tags,
                frontmatter: boundedFrontmatter.frontmatter,
              };
        const boundedDocumentMap = boundDocumentMap(
          params.include.documentMap ? buildDocumentMap(result.content) : null,
        );
        const availableTargets = ["editTarget", "documentEditTarget"].join(",");
        const payload = {
          note: {
            path: params.note,
            title: readTitleFromPath(params.note),
            modifiedAt: toIsoDate(result.updatedAt),
            size: result.size,
          },
          revision,
          selection: {
            anchor: resolved.anchor,
            totalLines: resolved.totalLines,
          },
          editTarget: {
            source: "note" as const,
            note: params.note,
            anchor: resolved.anchor,
            revision,
            currentText: truncated.truncated ? undefined : resolved.text,
          },
          documentEditTarget: {
            source: "note" as const,
            note: params.note,
            anchor: { type: "full" as const },
            revision,
            currentText: result.content.length <= params.maxChars ? result.content : undefined,
          },
          content: {
            text: truncated.text,
            truncated: truncated.truncated,
            charsReturned: truncated.text.length,
          },
          metadata,
          metadataTruncated:
            params.include.metadata === false
              ? false
              : boundedTags.truncated || boundedFrontmatter.truncated,
          documentMap: boundedDocumentMap.documentMap,
          documentMapTruncated: boundedDocumentMap.truncated,
          readMoreHint: buildReadMoreHint(
            params.note,
            resolved,
            params.maxChars,
            truncated.truncated,
          ),
          degraded: result.degraded,
          degradedReason: result.degradedReason,
        };
        const detail = [
          `note=${payload.note.path}`,
          `anchor=${anchorToText(payload.selection.anchor)}`,
          `revision=${payload.revision}`,
          `contentTruncated=${payload.content.truncated}`,
          `metadataTruncated=${payload.metadataTruncated}`,
          `documentMapTruncated=${payload.documentMapTruncated}`,
          `availableTargets=${availableTargets}`,
          `content="${previewText(payload.content.text)}"`,
        ].join("\n");
        return okResult(`Read note (${result.degraded ? "degraded" : "normal"})`, payload, detail);
      } catch (error) {
        const domainError =
          error instanceof DomainError ? error : new DomainError("INTERNAL", "read note failed");
        return errorResult(domainError);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.READ_ACTIVE_CONTEXT,
    {
      description:
        "Read the active editor buffer and return edit targets for the current active context.",
      inputSchema: readActiveContextInputSchema,
      outputSchema: readActiveContextOutputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    async (params) => {
      try {
        const result = await editorService.getContext();
        const normalizedContext = {
          activeFile:
            typeof result.context.activeFile === "string" ? result.context.activeFile : null,
          cursor: result.context.cursor ?? null,
          selection: typeof result.context.selection === "string" ? result.context.selection : "",
          selectionRange: result.context.selectionRange ?? null,
          content: typeof result.context.content === "string" ? result.context.content : "",
        };
        const boundedSelection = truncateText(normalizedContext.selection, params.maxChars);
        const boundedContent = truncateText(normalizedContext.content, params.maxChars);

        const editTargets = result.noActiveEditor
          ? null
          : {
              selection:
                normalizedContext.selection.length > 0 && normalizedContext.selectionRange
                  ? {
                      source: "active" as const,
                      activeFile: normalizedContext.activeFile,
                      anchor: {
                        type: "selection" as const,
                        range: normalizedContext.selectionRange,
                      },
                      revision: null,
                      currentText: boundedSelection.truncated
                        ? undefined
                        : normalizedContext.selection,
                    }
                  : undefined,
              cursor: normalizedContext.cursor
                ? {
                    source: "active" as const,
                    activeFile: normalizedContext.activeFile,
                    anchor: {
                      type: "cursor" as const,
                      position: normalizedContext.cursor,
                    },
                    revision: null,
                    currentText: "",
                  }
                : undefined,
              document: {
                source: "active" as const,
                activeFile: normalizedContext.activeFile,
                anchor: { type: "full" as const },
                revision: null,
                currentText: boundedContent.truncated ? undefined : normalizedContext.content,
              },
            };

        const payload = {
          ...normalizedContext,
          selection: boundedSelection.text,
          selectionTruncated: boundedSelection.truncated,
          selectionCharsReturned: boundedSelection.text.length,
          selectionTotalChars: normalizedContext.selection.length,
          editTargets,
          content: boundedContent.text,
          contentTruncated: boundedContent.truncated,
          contentCharsReturned: boundedContent.text.length,
          contentTotalChars: normalizedContext.content.length,
          degraded: result.degraded,
          degradedReason: result.degradedReason,
          noActiveEditor: result.noActiveEditor,
          editorState: result.noActiveEditor ? ("none" as const) : ("active" as const),
        };

        const availableTargets = payload.editTargets
          ? Object.entries(payload.editTargets)
              .filter(([, value]) => value)
              .map(([key]) => key)
          : [];

        return okResult(
          result.noActiveEditor
            ? `No active editor (${result.degraded ? "degraded" : "normal"})`
            : `Read active context (${result.degraded ? "degraded" : "normal"})`,
          payload,
          [
            `activeFile=${payload.activeFile ?? "null"}`,
            `cursor=${payload.cursor ? `${payload.cursor.line}:${payload.cursor.ch}` : "null"}`,
            `selection="${previewText(payload.selection, 120)}"`,
            `selectionTruncated=${payload.selectionTruncated}`,
            `contentTruncated=${payload.contentTruncated}`,
            `content="${previewText(payload.content, 120)}"`,
            `availableTargets=${availableTargets.join(",") || "none"}`,
          ].join("\n"),
        );
      } catch (error) {
        const domainError =
          error instanceof DomainError
            ? error
            : new DomainError("INTERNAL", "read active context failed");
        return errorResult(domainError);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.EDIT_NOTE,
    {
      description:
        'Edit a persisted note or the active editor using a structured target and change contract. Use the target returned by read_note.editTarget, read_note.documentEditTarget, or read_active_context.editTargets.*. Supported change.type values are replaceTarget, append, prepend, insertAtCursor, and replaceText. For replaceText, occurrence must be "first", "last", "all", or a positive number.',
      inputSchema: editNoteInputSchema,
      outputSchema: editNoteOutputSchema,
    },
    async (params) => {
      try {
        if (params.target.source === "note") {
          const current = await noteService.read(params.target.note);
          const revisionBefore = buildRevisionToken(
            params.target.note,
            current.updatedAt,
            current.size,
          );
          compareExpectedRevision(revisionBefore, params.target.revision);
          const resolved = resolveNoteSelection(current.content, params.target.anchor);
          compareExpectedText(resolved.text, params.target.currentText);
          const changed = applyEditChange(resolved.text, params.change);

          if (changed.nextText === resolved.text) {
            const mutationPreview = buildMutationPreview(resolved.text, changed.nextText);
            const payload = {
              status: "noOp" as const,
              target: {
                source: "note" as const,
                note: params.target.note,
                anchor: resolved.anchor,
              },
              revisionBefore,
              revisionAfter: revisionBefore,
              ...mutationPreview,
              degraded: current.degraded,
              degradedReason: current.degradedReason,
              readBack: {
                tool: "read_note" as const,
                input: { note: params.target.note, anchor: resolved.anchor },
              },
              warnings: changed.warnings,
            };
            return okResult(
              toMutationSummary("noOp", current.degraded),
              payload,
              [
                `status=${payload.status}`,
                `target.note=${payload.target.note}`,
                `target.anchor=${anchorToText(payload.target.anchor)}`,
                `preview.before="${previewText(payload.preview.before)}"`,
                `preview.beforeTruncated=${payload.previewMeta.beforeTruncated}`,
              ].join("\n"),
            );
          }

          const nextContent = replaceResolvedSelection(current.content, resolved, changed.nextText);
          const writeResult = await noteService.write(params.target.note, nextContent);
          const revisionAfter = buildRevisionToken(
            params.target.note,
            writeResult.updatedAt,
            writeResult.size,
          );

          const mutationPreview = buildMutationPreview(resolved.text, changed.nextText);
          const payload = {
            status: "applied" as const,
            target: {
              source: "note" as const,
              note: params.target.note,
              anchor: resolved.anchor,
            },
            revisionBefore,
            revisionAfter,
            ...mutationPreview,
            degraded: writeResult.degraded,
            degradedReason: writeResult.degradedReason,
            readBack: {
              tool: "read_note" as const,
              input: { note: params.target.note, anchor: resolved.anchor },
            },
            warnings: changed.warnings,
          };
          return okResult(
            `Edit applied (${writeResult.degraded ? "degraded" : "normal"})`,
            payload,
            [
              `status=${payload.status}`,
              `target.note=${payload.target.note}`,
              `target.anchor=${anchorToText(payload.target.anchor)}`,
              `preview.before="${previewText(payload.preview.before)}"`,
              `preview.after="${previewText(payload.preview.after)}"`,
              `preview.afterTruncated=${payload.previewMeta.afterTruncated}`,
            ].join("\n"),
          );
        }

        const current = await editorService.getContext();
        if (current.noActiveEditor || !current.context.activeFile) {
          throw new DomainError("UNAVAILABLE", "No active editor found");
        }
        if (
          params.target.activeFile !== null &&
          params.target.activeFile !== current.context.activeFile
        ) {
          throw new DomainError("CONFLICT", "Active editor changed since target was read");
        }

        if (params.target.anchor.type === "cursor") {
          if (params.change.type === "replaceText") {
            throw new DomainError("VALIDATION", "replaceText is not supported for cursor targets");
          }
          const insertedText =
            params.change.type === "replaceTarget" ? params.change.content : params.change.content;
          const insertResult = await editorService.insertText(
            insertedText,
            params.target.anchor.position,
          );
          const mutationPreview = buildMutationPreview("", insertedText);
          const payload = {
            status: "applied" as const,
            target: {
              source: "active" as const,
              activeFile: insertResult.context.activeFile,
              anchor: params.target.anchor,
            },
            revisionBefore: null,
            revisionAfter: null,
            ...mutationPreview,
            degraded: insertResult.degraded,
            degradedReason: insertResult.degradedReason,
            readBack: {
              tool: "read_active_context" as const,
              input: {},
            },
            warnings: [],
          };
          return okResult(
            toMutationSummary("applied", insertResult.degraded),
            payload,
            [
              `status=${payload.status}`,
              `target.activeFile=${payload.target.activeFile ?? "null"}`,
              `target.anchor=${payload.target.anchor.type}`,
              `preview.after="${previewText(payload.preview.after)}"`,
              `preview.afterTruncated=${payload.previewMeta.afterTruncated}`,
            ].join("\n"),
          );
        }

        const resolved = resolveActiveSelection(current.context.content, params.target.anchor);
        compareExpectedText(resolved.text, params.target.currentText);
        const changed = applyEditChange(resolved.text, params.change);

        if (changed.nextText === resolved.text) {
          const mutationPreview = buildMutationPreview(resolved.text, changed.nextText);
          const payload = {
            status: "noOp" as const,
            target: {
              source: "active" as const,
              activeFile: current.context.activeFile,
              anchor: params.target.anchor,
            },
            revisionBefore: null,
            revisionAfter: null,
            ...mutationPreview,
            degraded: current.degraded,
            degradedReason: current.degradedReason,
            readBack: {
              tool: "read_active_context" as const,
              input: {},
            },
            warnings: changed.warnings,
          };
          return okResult(
            toMutationSummary("noOp", current.degraded),
            payload,
            [
              `status=${payload.status}`,
              `target.activeFile=${payload.target.activeFile ?? "null"}`,
              `target.anchor=${payload.target.anchor.type}`,
              `preview.before="${previewText(payload.preview.before)}"`,
              `preview.beforeTruncated=${payload.previewMeta.beforeTruncated}`,
            ].join("\n"),
          );
        }

        if (!resolved.range) {
          throw new DomainError("VALIDATION", "Resolved active target does not include a range");
        }

        const replaceResult = await editorService.replaceRange(changed.nextText, resolved.range);
        const mutationPreview = buildMutationPreview(resolved.text, changed.nextText);
        const payload = {
          status: "applied" as const,
          target: {
            source: "active" as const,
            activeFile: replaceResult.context.activeFile,
            anchor: params.target.anchor,
          },
          revisionBefore: null,
          revisionAfter: null,
          ...mutationPreview,
          degraded: replaceResult.degraded,
          degradedReason: replaceResult.degradedReason,
          readBack: {
            tool: "read_active_context" as const,
            input: {},
          },
          warnings: changed.warnings,
        };
        return okResult(
          toMutationSummary("applied", replaceResult.degraded),
          payload,
          [
            `status=${payload.status}`,
            `target.activeFile=${payload.target.activeFile ?? "null"}`,
            `target.anchor=${payload.target.anchor.type}`,
            `preview.before="${previewText(payload.preview.before)}"`,
            `preview.after="${previewText(payload.preview.after)}"`,
            `preview.afterTruncated=${payload.previewMeta.afterTruncated}`,
          ].join("\n"),
        );
      } catch (error) {
        const domainError =
          error instanceof DomainError ? error : new DomainError("INTERNAL", "edit failed");
        return errorResult(domainError);
      }
    },
  );
}
