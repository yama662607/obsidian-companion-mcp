import { validateEditorPosition, validateEditorRange } from "../../../shared/editorPositions";
import type { PluginClient } from "../infra/pluginClient";
import { DomainError } from "./errors";

export interface EditorContext {
  [key: string]: unknown;
  activeFile: string | null;
  cursor: { line: number; ch: number } | null;
  selection: string;
  selectionRange: { from: { line: number; ch: number }; to: { line: number; ch: number } } | null;
  content: string;
}

export interface EditorOperationResult {
  context: EditorContext;
  degraded: boolean;
  degradedReason: string | null;
  noActiveEditor: boolean;
}

export class EditorService {
  constructor(private readonly pluginClient: PluginClient) {}

  private getFallbackDegradedReason(error: unknown): string {
    if (!(error instanceof DomainError)) {
      return "plugin_unavailable";
    }

    switch (error.code) {
      case "VALIDATION":
        return "plugin_validation_fallback_used";
      case "CONFLICT":
        return "plugin_conflict_fallback_used";
      case "INTERNAL":
        return "plugin_internal_fallback_used";
      default:
        return "plugin_unavailable";
    }
  }

  private context: EditorContext = {
    activeFile: null,
    cursor: null,
    selection: "",
    selectionRange: null,
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
    } catch (error) {
      return {
        context: this.context,
        degraded: true,
        degradedReason: this.getFallbackDegradedReason(error),
        noActiveEditor: this.context.activeFile === null,
      };
    }
  }

  setMockContext(context: EditorContext): void {
    this.context = context;
  }

  async insertText(
    text: string,
    position: { line: number; ch: number },
  ): Promise<EditorOperationResult> {
    if (!this.context.cursor || position.line < 0 || position.ch < 0) {
      throw new DomainError("VALIDATION", "Invalid insert position");
    }

    const validationError = validateEditorPosition(
      this.context.content,
      position,
      "Insert position",
    );
    if (validationError) {
      throw new DomainError("VALIDATION", validationError);
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
    } catch (error) {
      this.context = {
        ...this.context,
        content: `${this.context.content}${text}`,
        cursor: position,
      };
      return {
        context: this.context,
        degraded: true,
        degradedReason: this.getFallbackDegradedReason(error),
        noActiveEditor: this.context.activeFile === null,
      };
    }
  }

  async replaceRange(
    text: string,
    range: { from: { line: number; ch: number }; to: { line: number; ch: number } },
  ): Promise<EditorOperationResult> {
    const validationError = validateEditorRange(this.context.content, range);
    if (validationError) {
      throw new DomainError("VALIDATION", validationError);
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
    } catch (error) {
      const degradedReason =
        error instanceof DomainError && error.code !== "INTERNAL"
          ? this.getFallbackDegradedReason(error)
          : "plugin_unavailable_range_replace_unsupported";
      return {
        context: this.context,
        degraded: true,
        degradedReason,
        noActiveEditor: this.context.activeFile === null,
      };
    }
  }
}
