import { DomainError } from "./errors";

export interface EditorContext {
    activeFile: string | null;
    cursor: { line: number; ch: number } | null;
    selection: string;
    content: string;
}

export class EditorService {
    private context: EditorContext = {
        activeFile: null,
        cursor: null,
        selection: "",
        content: "",
    };

    getContext(): EditorContext {
        return this.context;
    }

    setMockContext(context: EditorContext): void {
        this.context = context;
    }

    insertText(text: string, position: { line: number; ch: number }): EditorContext {
        if (!this.context.cursor || position.line < 0 || position.ch < 0) {
            throw new DomainError("VALIDATION", "Invalid insert position");
        }

        this.context = {
            ...this.context,
            content: `${this.context.content}${text}`,
            cursor: position,
        };
        return this.context;
    }

    replaceRange(text: string, range: { from: { line: number; ch: number }; to: { line: number; ch: number } }): EditorContext {
        const invalid =
            range.from.line < 0 ||
            range.from.ch < 0 ||
            range.to.line < 0 ||
            range.to.ch < 0;

        if (invalid) {
            throw new DomainError("VALIDATION", "Invalid replace range");
        }

        this.context = {
            ...this.context,
            content: `${text}`,
            cursor: range.to,
        };
        return this.context;
    }
}
