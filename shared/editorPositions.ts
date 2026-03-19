export interface EditorPositionLike {
  line: number;
  ch: number;
}

export interface EditorRangeLike {
  from: EditorPositionLike;
  to: EditorPositionLike;
}

export function getEditorLines(content: string): string[] {
  return content.split("\n");
}

export function compareEditorPositions(a: EditorPositionLike, b: EditorPositionLike): number {
  if (a.line !== b.line) {
    return a.line - b.line;
  }
  return a.ch - b.ch;
}

export function validateEditorPosition(
  content: string,
  position: EditorPositionLike,
  label = "Position",
): string | null {
  if (position.line < 0 || position.ch < 0) {
    return `${label} must be non-negative`;
  }

  const lines = getEditorLines(content);
  if (position.line >= lines.length) {
    return `${label} line ${position.line} exceeds content line count ${lines.length}`;
  }

  const lineLength = lines[position.line]?.length ?? 0;
  if (position.ch > lineLength) {
    return `${label} ch ${position.ch} exceeds line length ${lineLength} at line ${position.line}`;
  }

  return null;
}

export function validateEditorRange(content: string, range: EditorRangeLike): string | null {
  const fromError = validateEditorPosition(content, range.from, "Range start");
  if (fromError) {
    return fromError;
  }

  const toError = validateEditorPosition(content, range.to, "Range end");
  if (toError) {
    return toError;
  }

  if (compareEditorPositions(range.from, range.to) > 0) {
    return "Range start must not be after range end";
  }

  return null;
}

export function editorPositionToOffset(content: string, position: EditorPositionLike): number {
  const lines = getEditorLines(content);
  let offset = 0;

  for (let index = 0; index < position.line; index += 1) {
    offset += (lines[index]?.length ?? 0) + 1;
  }

  return offset + position.ch;
}

export function sliceEditorRange(content: string, range: EditorRangeLike): string {
  const validationError = validateEditorRange(content, range);
  if (validationError) {
    throw new Error(validationError);
  }

  const start = editorPositionToOffset(content, range.from);
  const end = editorPositionToOffset(content, range.to);
  return content.slice(start, end);
}

export function replaceEditorRangeContent(
  content: string,
  range: EditorRangeLike,
  replacement: string,
): string {
  const validationError = validateEditorRange(content, range);
  if (validationError) {
    throw new Error(validationError);
  }

  const start = editorPositionToOffset(content, range.from);
  const end = editorPositionToOffset(content, range.to);
  return `${content.slice(0, start)}${replacement}${content.slice(end)}`;
}
