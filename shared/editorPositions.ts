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
