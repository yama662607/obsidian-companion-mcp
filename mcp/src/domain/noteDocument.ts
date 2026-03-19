import path from "node:path";
import {
  compareEditorPositions,
  type EditorPositionLike,
  type EditorRangeLike,
  getEditorLines,
  replaceEditorRangeContent,
  sliceEditorRange,
  validateEditorRange,
} from "../../../shared/editorPositions";
import { parseFrontmatter } from "../../../shared/frontmatter";
import { DomainError } from "./errors";

export type HeadingAnchor = {
  type: "heading";
  headingPath: string[];
  startLine?: number;
  endLine?: number;
};

export type NoteAnchor =
  | { type: "full" }
  | { type: "frontmatter"; startLine?: number; endLine?: number }
  | HeadingAnchor
  | { type: "block"; blockId: string; startLine?: number; endLine?: number }
  | { type: "line"; startLine: number; endLine: number };

export type ActiveAnchor =
  | { type: "full" }
  | { type: "selection"; range: EditorRangeLike }
  | { type: "range"; range: EditorRangeLike }
  | { type: "cursor"; position: EditorPositionLike };

export type EditTarget =
  | {
      source: "note";
      note: string;
      anchor: NoteAnchor;
      revision: string | null;
      currentText?: string;
    }
  | {
      source: "active";
      activeFile: string | null;
      anchor: ActiveAnchor;
      revision: null;
      currentText?: string;
    };

export type EditChange =
  | { type: "replaceTarget"; content: string }
  | { type: "append"; content: string }
  | { type: "prepend"; content: string }
  | {
      type: "replaceText";
      find: string;
      replace: string;
      occurrence: "first" | "last" | "all" | number;
    };

export type ResolvedNoteSelection = {
  anchor: NoteAnchor;
  range: EditorRangeLike;
  text: string;
  totalLines: number;
};

export type ResolvedActiveSelection = {
  anchor: ActiveAnchor;
  range: EditorRangeLike | null;
  text: string;
  totalLines: number;
};

type HeadingMatch = {
  path: string[];
  level: number;
  title: string;
  startLine: number;
  endLine: number;
};

type ChunkRecord = {
  id: string;
  path: string;
  text: string;
  startLine: number;
  endLine: number;
  headingPath: string[] | null;
};

const SEMANTIC_CHUNK_MAX_CHARS = 1_200;

function normalizeHeading(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

function buildHeadingMatches(content: string): HeadingMatch[] {
  const lines = getEditorLines(content);
  const stack: Array<{ level: number; title: string }> = [];
  const matches: HeadingMatch[] = [];
  let fenceMarker: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = line.match(/^(```+|~~~+)/);
    if (fence) {
      const marker = fence[1];
      if (fenceMarker === null) {
        fenceMarker = marker;
      } else if (marker.startsWith(fenceMarker[0])) {
        fenceMarker = null;
      }
      continue;
    }
    if (fenceMarker) {
      continue;
    }

    const match = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (!match) {
      continue;
    }

    const level = match[1].length;
    const title = normalizeHeading(match[2]);
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    stack.push({ level, title });
    matches.push({
      path: stack.map((item) => item.title),
      level,
      title,
      startLine: index,
      endLine: lines.length - 1,
    });
  }

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches.slice(index + 1).find((candidate) => candidate.level <= current.level);
    current.endLine = next ? Math.max(next.startLine - 1, current.startLine) : lines.length - 1;
  }

  return matches;
}

function lineToRange(lines: string[], startLine: number, endLine: number): EditorRangeLike {
  const safeEndLine = Math.min(endLine, Math.max(lines.length - 1, 0));
  return {
    from: { line: startLine, ch: 0 },
    to: { line: safeEndLine, ch: lines[safeEndLine]?.length ?? 0 },
  };
}

function findHeadingRange(
  content: string,
  headingPath: string[],
): { startLine: number; endLine: number } | null {
  const normalizedTarget = headingPath.map(normalizeHeading);
  const matches = buildHeadingMatches(content).filter(
    (candidate) =>
      candidate.path.length >= normalizedTarget.length &&
      candidate.path
        .slice(candidate.path.length - normalizedTarget.length)
        .every((value, index) => value === normalizedTarget[index]),
  );

  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    throw new DomainError("CONFLICT", `Heading path is ambiguous: ${headingPath.join(" > ")}`);
  }

  const [match] = matches;

  return { startLine: match.startLine, endLine: match.endLine };
}

function findFrontmatterRange(content: string): { startLine: number; endLine: number } | null {
  const matched = content.match(/^\s*---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n)?/);
  if (!matched) {
    return null;
  }

  const lines = getEditorLines(matched[0]);
  return { startLine: 0, endLine: Math.max(lines.length - 1, 0) };
}

function findBlockRange(
  content: string,
  blockId: string,
): { startLine: number; endLine: number } | null {
  const lines = getEditorLines(content);
  const blockPattern = new RegExp(`(?:\\s|^)\\^${blockId}\\s*$`);
  const blockLine = lines.findIndex((line) => blockPattern.test(line));
  if (blockLine === -1) {
    return null;
  }

  const headings = buildHeadingMatches(content);
  const enclosingHeading = headings
    .filter((heading) => heading.startLine <= blockLine && heading.endLine >= blockLine)
    .sort((a, b) => b.path.length - a.path.length)[0];
  const minLine = enclosingHeading ? enclosingHeading.startLine : 0;
  const maxLine = enclosingHeading ? enclosingHeading.endLine : lines.length - 1;

  let startLine = blockLine;
  while (startLine > minLine && lines[startLine - 1]?.trim().length > 0) {
    startLine -= 1;
  }

  let endLine = blockLine;
  while (endLine < maxLine && lines[endLine + 1]?.trim().length > 0) {
    endLine += 1;
  }

  return { startLine, endLine };
}

function normalizeLineRange(
  lines: string[],
  startLine: number,
  endLine: number,
): { startLine: number; endLine: number } {
  if (startLine < 0 || endLine < 0) {
    throw new DomainError("VALIDATION", "Line anchors must be non-negative");
  }
  if (startLine > endLine) {
    throw new DomainError("VALIDATION", "Anchor startLine must be <= endLine");
  }
  if (startLine >= lines.length || endLine >= lines.length) {
    throw new DomainError(
      "VALIDATION",
      `Anchor line range ${startLine}-${endLine} exceeds content line count ${lines.length}`,
    );
  }
  return { startLine, endLine };
}

function buildRangeText(content: string, range: EditorRangeLike): string {
  try {
    return sliceEditorRange(content, range);
  } catch (error) {
    throw new DomainError(
      "VALIDATION",
      error instanceof Error ? error.message : "Invalid target range",
    );
  }
}

export function buildRevisionToken(notePath: string, updatedAt: number, size: number): string {
  return Buffer.from(
    JSON.stringify({
      path: notePath,
      updatedAt: Math.trunc(updatedAt),
      size,
    }),
    "utf8",
  ).toString("base64url");
}

export function readTitleFromPath(notePath: string): string {
  return path.posix.basename(notePath, ".md");
}

export function resolveNoteSelection(content: string, anchor: NoteAnchor): ResolvedNoteSelection {
  const lines = getEditorLines(content);
  const totalLines = lines.length;
  let resolvedRange: { startLine: number; endLine: number } | null = null;

  switch (anchor.type) {
    case "full":
      resolvedRange = {
        startLine: 0,
        endLine: Math.max(totalLines - 1, 0),
      };
      break;
    case "frontmatter":
      resolvedRange =
        anchor.startLine !== undefined && anchor.endLine !== undefined
          ? normalizeLineRange(lines, anchor.startLine, anchor.endLine)
          : findFrontmatterRange(content);
      if (!resolvedRange) {
        throw new DomainError("NOT_FOUND", "Frontmatter not found");
      }
      break;
    case "heading":
      resolvedRange =
        anchor.startLine !== undefined && anchor.endLine !== undefined
          ? normalizeLineRange(lines, anchor.startLine, anchor.endLine)
          : findHeadingRange(content, anchor.headingPath);
      if (!resolvedRange) {
        throw new DomainError("NOT_FOUND", `Heading not found: ${anchor.headingPath.join(" > ")}`);
      }
      break;
    case "block":
      resolvedRange =
        anchor.startLine !== undefined && anchor.endLine !== undefined
          ? normalizeLineRange(lines, anchor.startLine, anchor.endLine)
          : findBlockRange(content, anchor.blockId);
      if (!resolvedRange) {
        throw new DomainError("NOT_FOUND", `Block not found: ^${anchor.blockId}`);
      }
      break;
    case "line":
      resolvedRange = normalizeLineRange(lines, anchor.startLine, anchor.endLine);
      break;
    default:
      throw new DomainError("VALIDATION", "Unsupported note anchor");
  }

  const range = lineToRange(lines, resolvedRange.startLine, resolvedRange.endLine);
  return {
    anchor:
      anchor.type === "full"
        ? anchor
        : anchor.type === "heading"
          ? {
              ...anchor,
              startLine: resolvedRange.startLine,
              endLine: resolvedRange.endLine,
            }
          : anchor.type === "block"
            ? {
                ...anchor,
                startLine: resolvedRange.startLine,
                endLine: resolvedRange.endLine,
              }
            : anchor.type === "frontmatter"
              ? {
                  ...anchor,
                  startLine: resolvedRange.startLine,
                  endLine: resolvedRange.endLine,
                }
              : {
                  ...anchor,
                  startLine: resolvedRange.startLine,
                  endLine: resolvedRange.endLine,
                },
    range,
    text: buildRangeText(content, range),
    totalLines,
  };
}

export function resolveActiveSelection(
  content: string,
  anchor: ActiveAnchor,
): ResolvedActiveSelection {
  const lines = getEditorLines(content);
  const totalLines = lines.length;

  switch (anchor.type) {
    case "full": {
      const range = lineToRange(lines, 0, Math.max(totalLines - 1, 0));
      return {
        anchor,
        range,
        text: buildRangeText(content, range),
        totalLines,
      };
    }
    case "selection":
    case "range": {
      const validationError = validateEditorRange(content, anchor.range);
      if (validationError) {
        throw new DomainError("VALIDATION", validationError);
      }
      return {
        anchor,
        range: anchor.range,
        text: buildRangeText(content, anchor.range),
        totalLines,
      };
    }
    case "cursor":
      return {
        anchor,
        range: null,
        text: "",
        totalLines,
      };
    default:
      throw new DomainError("VALIDATION", "Unsupported active anchor");
  }
}

export function replaceResolvedSelection(
  content: string,
  selection: { range: EditorRangeLike | null; text: string },
  replacement: string,
): string {
  if (!selection.range) {
    throw new DomainError("VALIDATION", "Target does not support direct replacement");
  }

  try {
    return replaceEditorRangeContent(content, selection.range, replacement);
  } catch (error) {
    throw new DomainError(
      "VALIDATION",
      error instanceof Error ? error.message : "Failed to replace selection",
    );
  }
}

export function applyEditChange(
  currentText: string,
  change: EditChange,
): {
  nextText: string;
  warnings: string[];
} {
  switch (change.type) {
    case "replaceTarget":
      return { nextText: change.content, warnings: [] };
    case "append":
      return { nextText: `${currentText}${change.content}`, warnings: [] };
    case "prepend":
      return { nextText: `${change.content}${currentText}`, warnings: [] };
    case "replaceText":
      return applyExactTextReplace(currentText, change);
    default:
      throw new DomainError("VALIDATION", "Unsupported edit change");
  }
}

function applyExactTextReplace(
  currentText: string,
  change: Extract<EditChange, { type: "replaceText" }>,
): { nextText: string; warnings: string[] } {
  if (!change.find) {
    throw new DomainError("VALIDATION", "replaceText.find must not be empty");
  }

  const matches: number[] = [];
  let searchFrom = 0;
  while (searchFrom <= currentText.length) {
    const index = currentText.indexOf(change.find, searchFrom);
    if (index === -1) {
      break;
    }
    matches.push(index);
    searchFrom = index + change.find.length;
  }

  if (matches.length === 0) {
    throw new DomainError("NOT_FOUND", `Text to replace was not found: ${change.find}`);
  }

  const targetIndexes =
    change.occurrence === "first"
      ? [matches[0]]
      : change.occurrence === "last"
        ? [matches[matches.length - 1]]
        : change.occurrence === "all"
          ? matches
          : Number.isInteger(change.occurrence) && change.occurrence > 0
            ? matches[change.occurrence - 1] !== undefined
              ? [matches[change.occurrence - 1]]
              : []
            : [];

  if (targetIndexes.length === 0) {
    throw new DomainError("CONFLICT", "Requested occurrence could not be resolved");
  }

  if (change.occurrence === "all" && matches.length > 1) {
    let nextText = currentText;
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const start = matches[index];
      nextText =
        nextText.slice(0, start) + change.replace + nextText.slice(start + change.find.length);
    }
    return { nextText, warnings: [] };
  }

  if (change.occurrence !== "all" && matches.length > 1 && typeof change.occurrence !== "number") {
    return {
      nextText:
        currentText.slice(0, targetIndexes[0]) +
        change.replace +
        currentText.slice(targetIndexes[0] + change.find.length),
      warnings: [`Multiple matches found; applied ${change.occurrence} occurrence.`],
    };
  }

  const start = targetIndexes[0];
  const nextText =
    currentText.slice(0, start) + change.replace + currentText.slice(start + change.find.length);
  return { nextText, warnings: [] };
}

export function compareExpectedText(actual: string, expected: string | undefined): void {
  if (expected !== undefined && actual !== expected) {
    throw new DomainError("CONFLICT", "Target text no longer matches expected currentText");
  }
}

export function compareExpectedRevision(
  actual: string | null,
  expected: string | null | undefined,
): void {
  if (expected !== undefined && expected !== actual) {
    throw new DomainError("CONFLICT", "Target revision no longer matches expected revision");
  }
}

export function findSnippetForQuery(
  content: string,
  query: string,
): {
  text: string;
  startLine: number;
  endLine: number;
} | null {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return null;
  }

  const lines = getEditorLines(content);
  const lowerQuery = trimmedQuery.toLowerCase();
  const matchIndex = lines.findIndex((line) => line.toLowerCase().includes(lowerQuery));
  if (matchIndex === -1) {
    return null;
  }

  const windowStart = Math.max(matchIndex - 1, 0);
  const windowEnd = Math.min(matchIndex + 1, lines.length - 1);
  return {
    text: lines
      .slice(windowStart, windowEnd + 1)
      .join("\n")
      .trim(),
    startLine: windowStart,
    endLine: windowEnd,
  };
}

export function buildDocumentMap(content: string): {
  headings: Array<{ path: string[]; level: number; startLine: number; endLine: number }>;
  blocks: Array<{ blockId: string; startLine: number; endLine: number }>;
  frontmatterFields: string[];
} {
  const headings = buildHeadingMatches(content).map((heading) => ({
    path: heading.path,
    level: heading.level,
    startLine: heading.startLine,
    endLine: heading.endLine,
  }));
  const lines = getEditorLines(content);
  const blocks = lines
    .map((line, lineIndex) => {
      const match = line.match(/(?:\s|^)\^([A-Za-z0-9-]+)\s*$/);
      return match
        ? {
            blockId: match[1],
            startLine: lineIndex,
            endLine: lineIndex,
          }
        : null;
    })
    .filter(
      (value): value is { blockId: string; startLine: number; endLine: number } => value !== null,
    );

  return {
    headings,
    blocks,
    frontmatterFields: Object.keys(parseFrontmatter(content)),
  };
}

export function buildSemanticChunks(notePath: string, content: string): ChunkRecord[] {
  const lines = getEditorLines(content);
  if (lines.length === 0) {
    return [];
  }

  const headings = buildHeadingMatches(content);
  const chunks: ChunkRecord[] = [];
  let currentStart = 0;

  while (currentStart < lines.length) {
    const currentEnd = Math.min(currentStart + 7, lines.length - 1);
    const chunkText = lines
      .slice(currentStart, currentEnd + 1)
      .join("\n")
      .trim();
    if (chunkText.length > 0) {
      const heading = headings
        .filter(
          (candidate) => candidate.startLine <= currentStart && candidate.endLine >= currentEnd,
        )
        .sort((a, b) => b.path.length - a.path.length)[0];
      chunks.push({
        id: `${notePath}:${currentStart}-${currentEnd}`,
        path: notePath,
        text: boundSemanticChunkText(chunkText),
        startLine: currentStart,
        endLine: currentEnd,
        headingPath: heading?.path ?? null,
      });
    }
    currentStart = currentEnd + 1;
  }

  return chunks;
}

export function boundSemanticChunkText(text: string, maxChars = SEMANTIC_CHUNK_MAX_CHARS): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(maxChars - 1, 0))}…`;
}

export function compareRanges(left: EditorRangeLike, right: EditorRangeLike): number {
  return compareEditorPositions(left.from, right.from) || compareEditorPositions(left.to, right.to);
}
