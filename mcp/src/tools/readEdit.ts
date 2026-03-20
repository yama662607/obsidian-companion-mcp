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

function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return {
    text: `${text.slice(0, Math.max(maxChars - 1, 0))}…`,
    truncated: true,
  };
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
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(maxChars - 1, 0))}…`;
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
        const metadata =
          params.include.metadata === false
            ? null
            : {
                tags: extractTags(result.metadata),
                frontmatter: result.metadata,
              };
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
          documentMap: params.include.documentMap ? buildDocumentMap(result.content) : null,
          readMoreHint: truncated.truncated
            ? {
                note: params.note,
                anchor: resolved.anchor,
                maxChars: Math.min(params.maxChars * 2, 20_000),
              }
            : null,
          degraded: result.degraded,
          degradedReason: result.degradedReason,
        };
        const detail = [
          `note=${payload.note.path}`,
          `anchor=${anchorToText(payload.selection.anchor)}`,
          `revision=${payload.revision}`,
          `truncated=${payload.content.truncated}`,
          `content="${previewText(payload.content.text)}"`,
          `editTarget=${JSON.stringify(payload.editTarget)}`,
          `documentEditTarget=${JSON.stringify(payload.documentEditTarget)}`,
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
            `editTargets=${JSON.stringify(payload.editTargets)}`,
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
            const payload = {
              status: "noOp" as const,
              target: {
                source: "note" as const,
                note: params.target.note,
                anchor: resolved.anchor,
              },
              revisionBefore,
              revisionAfter: revisionBefore,
              preview: { before: resolved.text, after: changed.nextText },
              degraded: current.degraded,
              degradedReason: current.degradedReason,
              readBack: {
                tool: "read_note" as const,
                input: { note: params.target.note, anchor: resolved.anchor },
              },
              warnings: changed.warnings,
            };
            return okResult(
              "No edit applied (normal)",
              payload,
              [
                `status=${payload.status}`,
                `target.note=${payload.target.note}`,
                `target.anchor=${anchorToText(payload.target.anchor)}`,
                `preview.before="${previewText(payload.preview.before)}"`,
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

          const payload = {
            status: "applied" as const,
            target: {
              source: "note" as const,
              note: params.target.note,
              anchor: resolved.anchor,
            },
            revisionBefore,
            revisionAfter,
            preview: { before: resolved.text, after: changed.nextText },
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
          const payload = {
            status: "applied" as const,
            target: {
              source: "active" as const,
              activeFile: insertResult.context.activeFile,
              anchor: params.target.anchor,
            },
            revisionBefore: null,
            revisionAfter: null,
            preview: { before: "", after: insertedText },
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
            ].join("\n"),
          );
        }

        const resolved = resolveActiveSelection(current.context.content, params.target.anchor);
        compareExpectedText(resolved.text, params.target.currentText);
        const changed = applyEditChange(resolved.text, params.change);

        if (changed.nextText === resolved.text) {
          const payload = {
            status: "noOp" as const,
            target: {
              source: "active" as const,
              activeFile: current.context.activeFile,
              anchor: params.target.anchor,
            },
            revisionBefore: null,
            revisionAfter: null,
            preview: { before: resolved.text, after: changed.nextText },
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
            ].join("\n"),
          );
        }

        if (!resolved.range) {
          throw new DomainError("VALIDATION", "Resolved active target does not include a range");
        }

        const replaceResult = await editorService.replaceRange(changed.nextText, resolved.range);
        const payload = {
          status: "applied" as const,
          target: {
            source: "active" as const,
            activeFile: replaceResult.context.activeFile,
            anchor: params.target.anchor,
          },
          revisionBefore: null,
          revisionAfter: null,
          preview: { before: resolved.text, after: changed.nextText },
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
