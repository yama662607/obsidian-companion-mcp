import { DomainError } from "./errors";
import type { PluginClient } from "../infra/pluginClient";

export interface EditorContext {
    [key: string]: unknown;
    activeFile: string | null;
    cursor: { line: number; ch: number } | null;
    selection: string;
    content: string;
}

export interface EditorOperationResult {
    context: EditorContext;
    degraded: boolean;
    degradedReason: string | null;
    noActiveEditor: boolean;
}

export class EditorService {
    constructor(private readonly pluginClient: PluginClient) { }

    private context: EditorContext = {
        activeFile: null,
        cursor: null,
        selection: "",
        content: "",
    };

    async getContext(): Promise<EditorOperationResult> {
        try {
            const context = await this.pluginClient.send<undefined, EditorContext>("editor.getContext");
            this.context = context;
            return {
                context,
                degraded: false,
                degradedReason: null,
                noActiveEditor: context.activeFile === null,
            };
        } catch {
            return {
                context: this.context,
                degraded: true,
                degradedReason: "plugin_unavailable",
                noActiveEditor: this.context.activeFile === null,
            };
        }
    }

    setMockContext(context: EditorContext): void {
        this.context = context;
    }

    async insertText(text: string, position: { line: number; ch: number }): Promise<EditorOperationResult> {
        if (!this.context.cursor || position.line < 0 || position.ch < 0) {
            throw new DomainError("VALIDATION", "Invalid insert position");
        }

        try {
            const context = await this.pluginClient.send<
                { command: "insertText"; text: string; pos: { line: number; ch: number } },
                EditorContext
            >("editor.applyCommand", {
                command: "insertText",
                text,
                pos: position,
            });

            this.context = context;
            return {
                context,
                degraded: false,
                degradedReason: null,
                noActiveEditor: context.activeFile === null,
            };
        } catch {
            this.context = {
                ...this.context,
                content: `${this.context.content}${text}`,
                cursor: position,
            };
            return {
                context: this.context,
                degraded: true,
                degradedReason: "plugin_unavailable",
                noActiveEditor: this.context.activeFile === null,
            };
        }
    }

    async replaceRange(
        text: string,
        range: { from: { line: number; ch: number }; to: { line: number; ch: number } },
    ): Promise<EditorOperationResult> {
        const invalid =
            range.from.line < 0 ||
            range.from.ch < 0 ||
            range.to.line < 0 ||
            range.to.ch < 0;

        if (invalid) {
            throw new DomainError("VALIDATION", "Invalid replace range");
        }

        try {
            const context = await this.pluginClient.send<
                {
                    command: "replaceRange";
                    text: string;
                    range: { from: { line: number; ch: number }; to: { line: number; ch: number } };
                },
                EditorContext
            >("editor.applyCommand", {
                command: "replaceRange",
                text,
                range,
            });

            this.context = context;
            return {
                context,
                degraded: false,
                degradedReason: null,
                noActiveEditor: context.activeFile === null,
            };
        } catch {
            this.context = {
                ...this.context,
                content: `${text}`,
                cursor: range.to,
            };
            return {
                context: this.context,
                degraded: true,
                degradedReason: "plugin_unavailable",
                noActiveEditor: this.context.activeFile === null,
            };
        }
    }
}
