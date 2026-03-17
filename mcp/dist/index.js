#!/usr/bin/env node

// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// ../shared/protocol.ts
var PROTOCOL_VERSION = "1.0.0";
function isJsonRpcFailure(input) {
  return input.error !== void 0;
}

// src/domain/errors.ts
var DomainError = class extends Error {
  code;
  correlationId;
  constructor(code, message, correlationId) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.correlationId = correlationId ?? `corr-${Date.now()}`;
  }
};

// src/infra/logger.ts
function logInfo(message) {
  console.error(`[mcp] ${message}`);
}
function logError(message) {
  console.error(`[mcp:error] ${message}`);
}

// src/infra/pluginClient.ts
var PluginClient = class {
  constructor(maxRetries = 3, expectedProtocolVersion = PROTOCOL_VERSION) {
    this.maxRetries = maxRetries;
    this.expectedProtocolVersion = expectedProtocolVersion;
  }
  availability = "unavailable";
  degradedReason = "startup_not_attempted";
  lastCorrelationId = null;
  retryCount = 0;
  async connect() {
    this.retryCount = 0;
    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      this.retryCount = attempt;
      try {
        const result = await this.performHandshake();
        const receivedProtocolVersion = result.protocolVersion ?? PROTOCOL_VERSION;
        if (receivedProtocolVersion !== this.expectedProtocolVersion) {
          const error2 = new DomainError(
            "CONFLICT",
            `Protocol version mismatch: expected ${this.expectedProtocolVersion}, got ${receivedProtocolVersion}`
          );
          this.transition("degraded", "protocol_mismatch", error2.correlationId);
          throw error2;
        }
        this.transition("normal", null, null);
        logInfo(`plugin connected on attempt ${attempt}/${this.maxRetries}`);
        return result;
      } catch (error2) {
        if (error2 instanceof DomainError && error2.code === "CONFLICT") {
          throw error2;
        }
        if (attempt < this.maxRetries) {
          logInfo(`plugin handshake retry ${attempt}/${this.maxRetries}`);
          continue;
        }
        const correlationId = error2 instanceof DomainError ? error2.correlationId : `corr-${Date.now()}`;
        this.transition("degraded", "retry_exhausted", correlationId);
        throw new DomainError("UNAVAILABLE", "Plugin connection retries exceeded", correlationId);
      }
    }
    const error = new DomainError("UNAVAILABLE", "Plugin connection retries exceeded");
    this.transition("degraded", "retry_exhausted", error.correlationId);
    throw error;
  }
  getAvailability() {
    return this.availability;
  }
  getRuntimeStatus() {
    return {
      availability: this.availability,
      degradedReason: this.degradedReason,
      retryCount: this.retryCount,
      lastCorrelationId: this.lastCorrelationId
    };
  }
  async send(method, params) {
    if (this.availability === "unavailable") {
      const error = new DomainError("UNAVAILABLE", "Plugin is unavailable", this.lastCorrelationId ?? void 0);
      this.transition("unavailable", "plugin_unavailable", error.correlationId);
      throw error;
    }
    const request = {
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
      protocolVersion: PROTOCOL_VERSION
    };
    const response = await this.mockResponse(request);
    if (isJsonRpcFailure(response)) {
      throw new DomainError(response.error.code, response.error.message, response.error.data.correlationId);
    }
    return response.result;
  }
  async mockResponse(request) {
    return {
      jsonrpc: "2.0",
      id: request.id,
      protocolVersion: PROTOCOL_VERSION,
      result: {}
    };
  }
  async performHandshake() {
    return {
      capabilities: [
        "semantic.search",
        "editor.getContext",
        "editor.applyCommand",
        "notes.read",
        "notes.write",
        "metadata.update"
      ],
      availability: "normal",
      protocolVersion: PROTOCOL_VERSION
    };
  }
  transition(availability, degradedReason, correlationId) {
    this.availability = availability;
    this.degradedReason = degradedReason;
    this.lastCorrelationId = correlationId;
  }
};

// src/domain/editorService.ts
var EditorService = class {
  constructor(pluginClient) {
    this.pluginClient = pluginClient;
  }
  context = {
    activeFile: null,
    cursor: null,
    selection: "",
    content: ""
  };
  async getContext() {
    try {
      const context = await this.pluginClient.send("editor.getContext");
      this.context = context;
      return {
        context,
        degraded: false,
        degradedReason: null,
        noActiveEditor: context.activeFile === null
      };
    } catch {
      return {
        context: this.context,
        degraded: true,
        degradedReason: "plugin_unavailable",
        noActiveEditor: this.context.activeFile === null
      };
    }
  }
  setMockContext(context) {
    this.context = context;
  }
  async insertText(text, position) {
    if (!this.context.cursor || position.line < 0 || position.ch < 0) {
      throw new DomainError("VALIDATION", "Invalid insert position");
    }
    const lineCount = this.context.content.length === 0 ? 1 : this.context.content.split("\n").length;
    if (position.line >= lineCount) {
      throw new DomainError(
        "VALIDATION",
        `Insert position line ${position.line} exceeds content line count ${lineCount}`
      );
    }
    try {
      const context = await this.pluginClient.send("editor.applyCommand", {
        command: "insertText",
        text,
        pos: position
      });
      this.context = context;
      return {
        context,
        degraded: false,
        degradedReason: null,
        noActiveEditor: context.activeFile === null
      };
    } catch {
      this.context = {
        ...this.context,
        content: `${this.context.content}${text}`,
        cursor: position
      };
      return {
        context: this.context,
        degraded: true,
        degradedReason: "plugin_unavailable",
        noActiveEditor: this.context.activeFile === null
      };
    }
  }
  async replaceRange(text, range) {
    const invalid = range.from.line < 0 || range.from.ch < 0 || range.to.line < 0 || range.to.ch < 0;
    if (invalid) {
      throw new DomainError("VALIDATION", "Invalid replace range");
    }
    try {
      const context = await this.pluginClient.send("editor.applyCommand", {
        command: "replaceRange",
        text,
        range
      });
      this.context = context;
      return {
        context,
        degraded: false,
        degradedReason: null,
        noActiveEditor: context.activeFile === null
      };
    } catch {
      return {
        context: this.context,
        degraded: true,
        degradedReason: "plugin_unavailable_range_replace_unsupported",
        noActiveEditor: this.context.activeFile === null
      };
    }
  }
};

// src/domain/embeddingProvider.ts
import { pipeline, env } from "@xenova/transformers";
import path from "path";
import os from "os";
import fs from "fs";
var LocalEmbeddingProvider = class {
  kind = "local";
  extractor = null;
  modelName = "Xenova/multilingual-e5-small";
  constructor() {
    const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
    let modelDir;
    if (vaultPath) {
      modelDir = path.join(
        vaultPath,
        ".obsidian",
        "plugins",
        "companion-mcp",
        "models"
      );
    } else {
      modelDir = path.join(os.homedir(), ".cache", "obsidian-companion-mcp", "models");
    }
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }
    env.allowRemoteModels = true;
    env.localModelPath = modelDir;
    env.cacheDir = modelDir;
  }
  async getExtractor() {
    if (!this.extractor) {
      this.extractor = await pipeline("feature-extraction", this.modelName);
    }
    return this.extractor;
  }
  /**
   * Generate embeddings using multilingual-e5-small.
   * E5 models require "query: " or "passage: " prefix for optimal performance.
   */
  async embed(text, isQuery = false) {
    const extractor = await this.getExtractor();
    const prefix = isQuery ? "query: " : "passage: ";
    const output = await extractor(`${prefix}${text}`, {
      pooling: "mean",
      normalize: true
    });
    return Array.from(output.data);
  }
};
var RemoteEmbeddingProvider = class {
  kind = "remote";
  async embed(text, isQuery = false) {
    const normalized = text.trim().toLowerCase();
    const score = normalized.length + 1;
    return [score, score / 2, score / 4];
  }
};
function createEmbeddingProvider(preferRemote = false) {
  return preferRemote ? new RemoteEmbeddingProvider() : new LocalEmbeddingProvider();
}

// src/domain/indexingQueue.ts
var IndexingQueue = class {
  queue = [];
  running = false;
  getPendingCount() {
    return this.queue.length;
  }
  isRunning() {
    return this.running;
  }
  enqueue(job) {
    const existingIndex = this.queue.findIndex((item) => item.path === job.path);
    if (existingIndex !== -1) {
      if (this.queue[existingIndex].updatedAt >= job.updatedAt) {
        return;
      }
      this.queue.splice(existingIndex, 1);
    }
    this.queue.push(job);
  }
  async process(handler, maxItems = 25) {
    if (this.running) {
      return 0;
    }
    this.running = true;
    let processed = 0;
    try {
      while (this.queue.length > 0 && processed < maxItems) {
        const job = this.queue.shift();
        if (!job) {
          break;
        }
        await handler(job);
        processed += 1;
      }
      return processed;
    } finally {
      this.running = false;
    }
  }
};

// src/domain/semanticService.ts
function cosineSimilarity(a, b) {
  let dotProduct = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    dotProduct += a[i] * b[i];
  }
  return dotProduct;
}
var SemanticService = class {
  notes = /* @__PURE__ */ new Map();
  queue = new IndexingQueue();
  provider;
  constructor(preferRemote = false) {
    this.provider = createEmbeddingProvider(preferRemote);
  }
  queueIndex(path4, snippet, updatedAt) {
    this.queue.enqueue({ path: path4, content: snippet, updatedAt });
  }
  async flushIndex(maxItems = 25) {
    return this.queue.process(async (job) => {
      const embedding = await this.provider.embed(job.content, false);
      this.notes.set(job.path, {
        path: job.path,
        snippet: job.content,
        updatedAt: job.updatedAt,
        embedding
      });
    }, maxItems);
  }
  upsert(path4, snippet, updatedAt) {
    this.queueIndex(path4, snippet, updatedAt);
  }
  remove(path4) {
    this.notes.delete(path4);
  }
  getIndexStatus() {
    const pendingCount = this.queue.getPendingCount();
    const indexedCount = this.notes.size;
    return {
      pendingCount,
      indexedCount,
      running: this.queue.isRunning(),
      ready: pendingCount === 0,
      isEmpty: indexedCount === 0
    };
  }
  async searchWithStatus(query, limit) {
    await this.flushIndex(Math.max(limit * 2, 10));
    const matches = await this.search(query, limit);
    return {
      matches,
      indexStatus: this.getIndexStatus()
    };
  }
  /**
   * ACTUAL SEMANTIC SEARCH IMPLEMENTATION:
   * 1. Embed query with "query: " prefix.
   * 2. Calculate cosine similarity against all indexed notes.
   * 3. Sort by score and return top results.
   */
  async search(query, limit) {
    if (this.notes.size === 0) return [];
    const queryVector = await this.provider.embed(query, true);
    return Array.from(this.notes.values()).map((note) => {
      const score = cosineSimilarity(queryVector, note.embedding);
      return {
        path: note.path,
        snippet: note.snippet,
        score
      };
    }).sort((a, b) => b.score - a.score).slice(0, limit);
  }
  // For testing/internal use
  getNotes() {
    return this.notes;
  }
  // Replace entire index (useful for loading from storage)
  setNotes(notes) {
    this.notes = notes;
  }
};

// src/infra/fallbackStorage.ts
import * as fs2 from "fs";
import * as path2 from "path";
var VAULT_PATH_ENV = "OBSIDIAN_VAULT_PATH";
function detectEol(content) {
  return content.includes("\r\n") ? "\r\n" : "\n";
}
function quoteYamlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
function formatScalar(value) {
  if (typeof value === "string") {
    const safePlain = value.length > 0 && !value.includes("\n") && !value.includes("\r") && !value.includes(":") && !value.includes("#") && !value.startsWith(" ") && !value.endsWith(" ");
    return safePlain ? value : quoteYamlString(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null || value === void 0) {
    return "null";
  }
  return JSON.stringify(value);
}
function renderFrontmatter(metadata, eol) {
  const entries = Object.entries(metadata);
  if (entries.length === 0) {
    return "";
  }
  const lines = entries.map(([key, value]) => `${key}: ${formatScalar(value)}`);
  return `---${eol}${lines.join(eol)}${eol}---${eol}`;
}
function stripFrontmatter(content) {
  const frontmatterPattern = /^\s*---\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n)?/;
  const matched = content.match(frontmatterPattern);
  if (!matched) {
    return content;
  }
  return content.slice(matched[0].length);
}
function parseFrontmatter(content) {
  const frontmatterPattern = /^\s*---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n)?/;
  const matched = content.match(frontmatterPattern);
  if (!matched) {
    return {};
  }
  const metadata = {};
  for (const line of matched[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes(":")) {
      continue;
    }
    const separator = trimmed.indexOf(":");
    const key = trimmed.slice(0, separator).trim();
    let rawValue = trimmed.slice(separator + 1).trim();
    if (!key) {
      continue;
    }
    if (rawValue.startsWith("'") && rawValue.endsWith("'") || rawValue.startsWith('"') && rawValue.endsWith('"')) {
      rawValue = rawValue.slice(1, -1);
    }
    if (rawValue === "null") {
      metadata[key] = null;
    } else if (rawValue === "true" || rawValue === "false") {
      metadata[key] = rawValue === "true";
    } else if (!Number.isNaN(Number(rawValue)) && rawValue !== "") {
      metadata[key] = Number(rawValue);
    } else {
      metadata[key] = rawValue;
    }
  }
  return metadata;
}
function applyFrontmatter(content, metadata) {
  const eol = detectEol(content);
  const body = stripFrontmatter(content);
  const frontmatter = renderFrontmatter(metadata, eol);
  return frontmatter ? `${frontmatter}${body}` : body;
}
function getVaultRoot() {
  const configured = process.env[VAULT_PATH_ENV]?.trim();
  if (!configured) {
    throw new DomainError("UNAVAILABLE", `${VAULT_PATH_ENV} is required for note operations`);
  }
  return path2.resolve(configured);
}
function resolveVaultPath(notePath) {
  if (!notePath) {
    throw new DomainError("VALIDATION", "path is required");
  }
  const normalized = path2.posix.normalize(notePath.replaceAll("\\", "/"));
  if (normalized.startsWith("/") || normalized === ".." || normalized.startsWith("../")) {
    throw new DomainError("VALIDATION", `Invalid vault-relative path: ${notePath}`);
  }
  const vaultRoot = getVaultRoot();
  const resolved = path2.resolve(vaultRoot, normalized);
  const relative2 = path2.relative(vaultRoot, resolved);
  if (relative2 === ".." || relative2.startsWith(`..${path2.sep}`) || path2.isAbsolute(relative2)) {
    throw new DomainError("VALIDATION", `Path escapes vault root: ${notePath}`);
  }
  return resolved;
}
function ensureParentDir(filePath) {
  const dir = path2.dirname(filePath);
  fs2.mkdirSync(dir, { recursive: true });
}
function readNote(path4) {
  const filePath = resolveVaultPath(path4);
  if (!fs2.existsSync(filePath)) {
    return void 0;
  }
  const content = fs2.readFileSync(filePath, "utf8");
  return {
    content,
    metadata: parseFrontmatter(content)
  };
}
function writeNote(path4, content) {
  const filePath = resolveVaultPath(path4);
  const existing = readNote(path4);
  const metadata = existing?.metadata ?? {};
  const next = {
    content: applyFrontmatter(content, metadata),
    metadata
  };
  ensureParentDir(filePath);
  fs2.writeFileSync(filePath, next.content, "utf8");
  return next;
}
function updateMetadata(path4, metadata) {
  const filePath = resolveVaultPath(path4);
  const existing = readNote(path4) ?? { content: "", metadata: {} };
  const mergedMetadata = { ...existing.metadata, ...metadata };
  const next = {
    content: applyFrontmatter(existing.content, mergedMetadata),
    metadata: mergedMetadata
  };
  ensureParentDir(filePath);
  fs2.writeFileSync(filePath, next.content, "utf8");
  return next;
}
function deleteNote(path4) {
  const filePath = resolveVaultPath(path4);
  if (!fs2.existsSync(filePath)) {
    return false;
  }
  fs2.rmSync(filePath);
  return true;
}

// src/domain/noteService.ts
var NoteService = class {
  constructor(pluginClient, semanticService) {
    this.pluginClient = pluginClient;
    this.semanticService = semanticService;
  }
  async read(path4) {
    try {
      await this.pluginClient.send("notes.read", { path: path4 });
      const hit = readNote(path4);
      if (!hit) {
        throw new DomainError("NOT_FOUND", `Note not found: ${path4}`);
      }
      return { content: hit.content, metadata: hit.metadata, degraded: false, degradedReason: null };
    } catch {
      const hit = readNote(path4);
      if (!hit) {
        throw new DomainError("NOT_FOUND", `Note not found: ${path4}`);
      }
      return {
        content: hit.content,
        metadata: hit.metadata,
        degraded: true,
        degradedReason: "plugin_unavailable"
      };
    }
  }
  async write(path4, content) {
    if (!path4) {
      throw new DomainError("VALIDATION", "path is required");
    }
    try {
      await this.pluginClient.send("notes.write", { path: path4, content });
      const record = writeNote(path4, content);
      this.semanticService?.upsert(path4, record.content, Date.now());
      return { path: path4, degraded: false, degradedReason: null };
    } catch {
      const record = writeNote(path4, content);
      this.semanticService?.upsert(path4, record.content, Date.now());
      return { path: path4, degraded: true, degradedReason: "plugin_unavailable" };
    }
  }
  async delete(path4) {
    try {
      await this.pluginClient.send("notes.delete", { path: path4 });
      const deleted = deleteNote(path4);
      if (!deleted) {
        throw new DomainError("NOT_FOUND", `Note not found: ${path4}`);
      }
      this.semanticService?.remove(path4);
      return { deleted: true, degraded: false, degradedReason: null };
    } catch (error) {
      if (error instanceof DomainError && error.code === "NOT_FOUND") {
        throw error;
      }
      const deleted = deleteNote(path4);
      if (!deleted) {
        throw new DomainError("NOT_FOUND", `Note not found: ${path4}`);
      }
      this.semanticService?.remove(path4);
      return { deleted: true, degraded: true, degradedReason: "plugin_unavailable" };
    }
  }
  async updateMetadata(path4, metadata) {
    try {
      await this.pluginClient.send("metadata.update", { path: path4, metadata });
      const record = updateMetadata(path4, metadata);
      this.semanticService?.upsert(path4, record.content, Date.now());
      return { path: path4, metadata: record.metadata, degraded: false, degradedReason: null };
    } catch {
      const record = updateMetadata(path4, metadata);
      this.semanticService?.upsert(path4, record.content, Date.now());
      return {
        path: path4,
        metadata: record.metadata,
        degraded: true,
        degradedReason: "plugin_unavailable"
      };
    }
  }
};

// src/infra/vectorStore.ts
import fs3 from "fs";
import path3 from "path";
var VectorStore = class {
  indexPath;
  constructor() {
    const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
    if (vaultPath) {
      this.indexPath = path3.join(
        vaultPath,
        ".obsidian",
        "plugins",
        "companion-mcp",
        "data",
        "semantic-index.json"
      );
    } else {
      this.indexPath = path3.join(process.cwd(), "semantic-index.json");
    }
  }
  async load() {
    try {
      if (!fs3.existsSync(this.indexPath)) {
        return /* @__PURE__ */ new Map();
      }
      const raw = fs3.readFileSync(this.indexPath, "utf-8");
      const data = JSON.parse(raw);
      logInfo(`vector index loaded: ${data.length} notes from ${this.indexPath}`);
      return new Map(data);
    } catch (error) {
      logError(`failed to load vector index: ${error}`);
      return /* @__PURE__ */ new Map();
    }
  }
  async save(notes) {
    try {
      const dir = path3.dirname(this.indexPath);
      if (!fs3.existsSync(dir)) {
        fs3.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(notes.entries());
      fs3.writeFileSync(this.indexPath, JSON.stringify(data), "utf-8");
      logInfo(`vector index saved: ${notes.size} notes to ${this.indexPath}`);
    } catch (error) {
      logError(`failed to save vector index: ${error}`);
    }
  }
  getIndexPath() {
    return this.indexPath;
  }
};

// src/tools/semanticSearch.ts
import { z } from "zod";

// src/domain/toolResult.ts
function okResult(summary, structuredContent) {
  return {
    content: [{ type: "text", text: summary }],
    structuredContent
  };
}
function errorResult(error) {
  const payload = {
    isError: true,
    code: error.code,
    message: error.message,
    correlationId: error.correlationId
  };
  return {
    isError: true,
    code: error.code,
    message: error.message,
    correlationId: error.correlationId,
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: {
      code: error.code,
      message: error.message,
      correlationId: error.correlationId
    }
  };
}

// src/constants/toolNames.ts
var TOOL_NAMES = {
  SEARCH_NOTES_SEMANTIC: "search_notes_semantic",
  GET_ACTIVE_CONTEXT: "get_active_context",
  INSERT_AT_CURSOR: "insert_at_cursor",
  REPLACE_RANGE: "replace_range",
  CREATE_NOTE: "create_note",
  GET_NOTE: "get_note",
  UPDATE_NOTE_CONTENT: "update_note_content",
  DELETE_NOTE: "delete_note",
  UPDATE_NOTE_METADATA: "update_note_metadata"
};
var TOOL_NAME_LIST = [
  TOOL_NAMES.SEARCH_NOTES_SEMANTIC,
  TOOL_NAMES.GET_ACTIVE_CONTEXT,
  TOOL_NAMES.INSERT_AT_CURSOR,
  TOOL_NAMES.REPLACE_RANGE,
  TOOL_NAMES.CREATE_NOTE,
  TOOL_NAMES.GET_NOTE,
  TOOL_NAMES.UPDATE_NOTE_CONTENT,
  TOOL_NAMES.DELETE_NOTE,
  TOOL_NAMES.UPDATE_NOTE_METADATA
];

// src/tools/semanticSearch.ts
function registerSemanticSearchTool(server, semanticService) {
  server.registerTool(
    TOOL_NAMES.SEARCH_NOTES_SEMANTIC,
    {
      description: "Search notes semantically and return ranked matches with snippets.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Semantic search query text"),
        limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of ranked matches")
      }),
      annotations: {
        readOnlyHint: true
      }
    },
    async (params) => {
      try {
        const result = await semanticService.searchWithStatus(params.query, params.limit);
        const summary = result.matches.length > 0 ? `Found ${result.matches.length} matches` : result.indexStatus.ready ? result.indexStatus.isEmpty ? "Index is empty (no notes indexed)" : "No semantic matches found" : `Index not ready (${result.indexStatus.pendingCount} pending)`;
        return okResult(summary, {
          ...result,
          degraded: false,
          degradedReason: null
        });
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "semantic search failed");
        return errorResult(domainError);
      }
    }
  );
}

// src/tools/editorCommands.ts
import { z as z3 } from "zod";

// src/schemas/common.ts
import { z as z2 } from "zod";
var notePathSchema = z2.string().min(1).refine((value) => {
  const normalized = value.replaceAll("\\", "/");
  return !normalized.startsWith("/") && !normalized.startsWith("../") && normalized !== "..";
}, "Path must be vault-relative").describe("Vault-relative markdown note path");
var limitSchema = z2.number().int().min(1).max(50).default(10);
var positionSchema = z2.object({
  line: z2.number().int().min(0),
  ch: z2.number().int().min(0)
});
var rangeSchema = z2.object({
  from: positionSchema,
  to: positionSchema
});

// src/tools/editorCommands.ts
function registerEditorTools(server, editorService) {
  server.registerTool(
    TOOL_NAMES.GET_ACTIVE_CONTEXT,
    {
      description: "Get active file, cursor, selection, and unsaved editor content.",
      inputSchema: z3.object({}),
      annotations: {
        readOnlyHint: true
      }
    },
    async () => {
      try {
        const result = await editorService.getContext();
        const normalizedContext = {
          activeFile: typeof result.context.activeFile === "string" ? result.context.activeFile : null,
          cursor: result.context.cursor ?? null,
          selection: typeof result.context.selection === "string" ? result.context.selection : "",
          content: typeof result.context.content === "string" ? result.context.content : ""
        };
        const summary = result.noActiveEditor ? `No active editor (${result.degraded ? "degraded" : "normal"})` : `Retrieved active editor context (${result.degraded ? "degraded" : "normal"})`;
        return okResult(summary, {
          ...normalizedContext,
          degraded: result.degraded,
          degradedReason: result.degradedReason,
          noActiveEditor: result.noActiveEditor,
          editorState: result.noActiveEditor ? "none" : "active"
        });
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "context retrieval failed");
        return errorResult(domainError);
      }
    }
  );
  server.registerTool(
    TOOL_NAMES.INSERT_AT_CURSOR,
    {
      description: "Insert text at a validated editor position.",
      inputSchema: z3.object({
        text: z3.string().describe("Text to insert at cursor position"),
        position: positionSchema
      })
    },
    async (params) => {
      try {
        const result = await editorService.insertText(params.text, params.position);
        return okResult(`Text inserted (${result.degraded ? "degraded" : "normal"})`, {
          ...result.context,
          degraded: result.degraded,
          degradedReason: result.degradedReason,
          noActiveEditor: result.noActiveEditor
        });
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "insert failed");
        return errorResult(domainError);
      }
    }
  );
  server.registerTool(
    TOOL_NAMES.REPLACE_RANGE,
    {
      description: "Replace text in a validated editor range.",
      inputSchema: z3.object({
        text: z3.string().describe("Replacement text"),
        range: z3.object({
          from: positionSchema,
          to: positionSchema
        })
      })
    },
    async (params) => {
      try {
        const result = await editorService.replaceRange(params.text, params.range);
        return okResult(`Range replaced (${result.degraded ? "degraded" : "normal"})`, {
          ...result.context,
          degraded: result.degraded,
          degradedReason: result.degradedReason,
          noActiveEditor: result.noActiveEditor
        });
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "replace failed");
        return errorResult(domainError);
      }
    }
  );
}

// src/schemas/notes.ts
import { z as z4 } from "zod";
var createNoteInputSchema = z4.object({
  path: notePathSchema,
  content: z4.string().default("").describe("Initial markdown content for the note")
});
var getNoteInputSchema = z4.object({
  path: notePathSchema
});
var updateNoteContentInputSchema = z4.object({
  path: notePathSchema,
  content: z4.string().describe("Full markdown content to replace the note body")
});
var deleteNoteInputSchema = z4.object({
  path: notePathSchema.describe("Vault-relative markdown note path to delete")
});
var updateNoteMetadataInputSchema = z4.object({
  path: notePathSchema,
  metadata: z4.record(z4.unknown()).describe("Frontmatter key/value patch to merge")
});

// src/tools/noteManagement.ts
function registerNoteTool(server, noteService) {
  server.registerTool(
    TOOL_NAMES.CREATE_NOTE,
    {
      description: "Create a markdown note at the given vault-relative path.",
      inputSchema: createNoteInputSchema
    },
    async (params) => {
      try {
        const result = await noteService.write(params.path, params.content);
        return okResult(`Created note (${result.degraded ? "degraded" : "normal"})`, result);
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "create note failed");
        return errorResult(domainError);
      }
    }
  );
  server.registerTool(
    TOOL_NAMES.GET_NOTE,
    {
      description: "Read a markdown note content and normalized metadata.",
      inputSchema: getNoteInputSchema,
      annotations: {
        readOnlyHint: true
      }
    },
    async (params) => {
      try {
        const result = await noteService.read(params.path);
        return okResult(`Read note (${result.degraded ? "degraded" : "normal"})`, result);
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "get note failed");
        return errorResult(domainError);
      }
    }
  );
  server.registerTool(
    TOOL_NAMES.UPDATE_NOTE_CONTENT,
    {
      description: "Replace full markdown content of an existing note.",
      inputSchema: updateNoteContentInputSchema
    },
    async (params) => {
      try {
        const result = await noteService.write(params.path, params.content);
        return okResult(`Updated note content (${result.degraded ? "degraded" : "normal"})`, result);
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "update note content failed");
        return errorResult(domainError);
      }
    }
  );
  server.registerTool(
    TOOL_NAMES.DELETE_NOTE,
    {
      description: "Delete a note by path. This operation is destructive.",
      inputSchema: deleteNoteInputSchema,
      annotations: {
        destructiveHint: true
      }
    },
    async (params) => {
      try {
        const result = await noteService.delete(params.path);
        return okResult(`Deleted note (${result.degraded ? "degraded" : "normal"})`, result);
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "delete failed");
        return errorResult(domainError);
      }
    }
  );
  server.registerTool(
    TOOL_NAMES.UPDATE_NOTE_METADATA,
    {
      description: "Patch note metadata/frontmatter with schema-validated key-values.",
      inputSchema: updateNoteMetadataInputSchema,
      annotations: {
        idempotentHint: true
      }
    },
    async (params) => {
      try {
        const result = await noteService.updateMetadata(params.path, params.metadata);
        return okResult(`Updated metadata (${result.degraded ? "degraded" : "normal"})`, result);
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "update metadata failed");
        return errorResult(domainError);
      }
    }
  );
}

// src/constants/resourceUris.ts
var RESOURCE_URIS = {
  CAPABILITY_MATRIX: "capability://matrix",
  SCHEMA_SUMMARY: "schema://tool-inputs",
  FALLBACK_BEHAVIOR: "fallback://behavior",
  ACTIVE_EDITOR_CONTEXT: "context://active-editor",
  RUNTIME_STATUS: "runtime://status",
  REVIEW_CHECKLIST: "review://checklist"
};
var RESOURCE_URI_LIST = [
  RESOURCE_URIS.CAPABILITY_MATRIX,
  RESOURCE_URIS.SCHEMA_SUMMARY,
  RESOURCE_URIS.FALLBACK_BEHAVIOR,
  RESOURCE_URIS.ACTIVE_EDITOR_CONTEXT,
  RESOURCE_URIS.RUNTIME_STATUS,
  RESOURCE_URIS.REVIEW_CHECKLIST
];

// src/constants/promptNames.ts
var PROMPT_NAMES = {
  CONTEXT_REWRITE: "workflow_context_rewrite",
  SEARCH_THEN_INSERT: "workflow_search_then_insert",
  AGENT_RUNTIME_REVIEW: "workflow_agent_runtime_review"
};
var PROMPT_NAME_LIST = [
  PROMPT_NAMES.CONTEXT_REWRITE,
  PROMPT_NAMES.SEARCH_THEN_INSERT,
  PROMPT_NAMES.AGENT_RUNTIME_REVIEW
];

// src/resources/capabilityMatrix.ts
function registerCapabilityMatrixResource(server) {
  server.registerResource(
    "capability_matrix",
    RESOURCE_URIS.CAPABILITY_MATRIX,
    {
      title: "Capability Matrix",
      description: "Tool/Resource/Prompt classification matrix",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(
            {
              tools: TOOL_NAME_LIST,
              resources: RESOURCE_URI_LIST,
              prompts: PROMPT_NAME_LIST
            },
            null,
            2
          )
        }
      ]
    })
  );
}

// src/resources/schemaSummary.ts
function registerSchemaSummaryResource(server) {
  server.registerResource(
    "schema_summary",
    RESOURCE_URIS.SCHEMA_SUMMARY,
    {
      title: "Tool Input Schemas",
      description: "Summary of strict input schema policy for mcp tools",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(
            {
              policy: {
                requiresZodObject: true,
                requiresEnumForFiniteValues: true,
                requiresBoundedLimit: true,
                disallowAny: true
              }
            },
            null,
            2
          )
        }
      ]
    })
  );
}

// src/resources/fallbackBehavior.ts
function registerFallbackBehaviorResource(server) {
  server.registerResource(
    "fallback_behavior",
    RESOURCE_URIS.FALLBACK_BEHAVIOR,
    {
      title: "Fallback Behavior",
      description: "Describes degraded-mode behavior when plugin is unavailable",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(
            {
              degradedMode: {
                triggers: ["plugin-unreachable", "compatibility-failed"],
                noteOperations: "vault file-backed fallback",
                metadataOperations: "vault file-backed fallback",
                semanticSearch: "unavailable",
                requiredEnv: ["OBSIDIAN_VAULT_PATH"]
              }
            },
            null,
            2
          )
        }
      ]
    })
  );
}

// src/resources/activeEditorContext.ts
function registerActiveEditorContextResource(server, editorService) {
  server.registerResource(
    "active_editor_context",
    RESOURCE_URIS.ACTIVE_EDITOR_CONTEXT,
    {
      title: "Active Editor Context",
      description: "Read-only snapshot of active editor state",
      mimeType: "application/json"
    },
    async (uri) => {
      const result = await editorService.getContext();
      const normalizedContext = {
        activeFile: typeof result.context.activeFile === "string" ? result.context.activeFile : null,
        cursor: result.context.cursor ?? null,
        selection: typeof result.context.selection === "string" ? result.context.selection : "",
        content: typeof result.context.content === "string" ? result.context.content : ""
      };
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                ...normalizedContext,
                degraded: result.degraded,
                degradedReason: result.degradedReason,
                noActiveEditor: result.noActiveEditor,
                editorState: result.noActiveEditor ? "none" : "active"
              },
              null,
              2
            )
          }
        ]
      };
    }
  );
}

// src/resources/runtimeStatus.ts
function registerRuntimeStatusResource(server, pluginClient) {
  server.registerResource(
    "runtime_status",
    RESOURCE_URIS.RUNTIME_STATUS,
    {
      title: "Runtime Status",
      description: "MCP runtime availability, retries, and degraded reason",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(pluginClient.getRuntimeStatus(), null, 2)
        }
      ]
    })
  );
}

// src/resources/reviewChecklist.ts
function registerReviewChecklistResource(server) {
  server.registerResource(
    "review_checklist",
    RESOURCE_URIS.REVIEW_CHECKLIST,
    {
      title: "Agent Review Checklist",
      description: "Read-only checklist for runtime and MCP contract review",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(
            {
              checklist: [
                "Tool names and descriptions are intent-first and unambiguous",
                "Input schemas are strict z.object with bounded fields",
                "Dangerous operations use destructiveHint and narrow input",
                "Responses include structuredContent and actionable degradedReason",
                "Runtime status and fallback behavior are observable via resources",
                "Prompt guidance references current tool names and expected outputs"
              ]
            },
            null,
            2
          )
        }
      ]
    })
  );
}

// src/prompts/contextRewrite.ts
import { z as z5 } from "zod";
function registerContextRewritePrompt(server) {
  server.registerPrompt(
    PROMPT_NAMES.CONTEXT_REWRITE,
    {
      title: "Context-aware Rewrite",
      description: "Rewrite currently selected text while preserving local context",
      argsSchema: {
        style: z5.string().min(1).optional()
      }
    },
    async (args) => {
      const style = typeof args.style === "string" && args.style.trim().length > 0 ? args.style : "keep original tone";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `Use ${TOOL_NAMES.GET_ACTIVE_CONTEXT} to retrieve current selection and surrounding context.`,
                "Rewrite only selected text and avoid side effects.",
                `Preferred style: ${style}.`
              ].join("\n")
            }
          }
        ]
      };
    }
  );
}

// src/prompts/searchThenInsert.ts
import { z as z6 } from "zod";
function registerSearchThenInsertPrompt(server) {
  server.registerPrompt(
    PROMPT_NAMES.SEARCH_THEN_INSERT,
    {
      title: "Search Then Insert",
      description: "Find relevant context semantically and insert a concise note at cursor",
      argsSchema: {
        query: z6.string().min(1)
      }
    },
    async (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Run ${TOOL_NAMES.SEARCH_NOTES_SEMANTIC} with query: ${args.query}`,
              "Summarize the highest-ranked result in one sentence.",
              `Insert that summary via ${TOOL_NAMES.INSERT_AT_CURSOR}.`
            ].join("\n")
          }
        }
      ]
    })
  );
}

// src/prompts/agentRuntimeReview.ts
import { z as z7 } from "zod";
function registerAgentRuntimeReviewPrompt(server) {
  server.registerPrompt(
    PROMPT_NAMES.AGENT_RUNTIME_REVIEW,
    {
      title: "Agent Runtime Review",
      description: "Generate a focused runtime and MCP contract review request for an agent",
      argsSchema: {
        scope: z7.string().min(1).describe("Review scope, file set, or capability area"),
        severityThreshold: z7.enum(["high", "medium", "low"]).default("medium")
      }
    },
    async (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are reviewing an MCP server implementation.",
              `Scope: ${args.scope}`,
              `Report findings with severity >= ${args.severityThreshold}.`,
              "Focus areas:",
              "1) Tool contract quality (naming, schema strictness, annotations)",
              "2) Runtime behavior (startup handshake, degraded reasons, fallback consistency)",
              "3) Semantic indexing readiness and result interpretation",
              "4) Resource and prompt consistency with the tool surface",
              "Use read-only checks first, include concrete file/line references, and suggest minimal patches."
            ].join("\n")
          }
        }
      ]
    })
  );
}

// src/server.ts
function createServer() {
  const server = new McpServer({
    name: "obsidian-companion-mcp",
    version: "0.1.0"
  });
  const pluginClient = new PluginClient();
  const editorService = new EditorService(pluginClient);
  const semanticService = new SemanticService();
  const vectorStore = new VectorStore();
  const noteService = new NoteService(pluginClient, semanticService);
  registerSemanticSearchTool(server, semanticService);
  registerEditorTools(server, editorService);
  registerNoteTool(server, noteService);
  registerCapabilityMatrixResource(server);
  registerSchemaSummaryResource(server);
  registerFallbackBehaviorResource(server);
  registerActiveEditorContextResource(server, editorService);
  registerRuntimeStatusResource(server, pluginClient);
  registerReviewChecklistResource(server);
  registerContextRewritePrompt(server);
  registerSearchThenInsertPrompt(server);
  registerAgentRuntimeReviewPrompt(server);
  return { server, pluginClient, semanticService, vectorStore };
}
async function runServer() {
  const { server, pluginClient, semanticService, vectorStore } = createServer();
  const existingNotes = await vectorStore.load();
  semanticService.setNotes(existingNotes);
  const shutdown = async () => {
    clearInterval(saveInterval);
    logInfo("shutting down, saving vector index...");
    await vectorStore.save(semanticService.getNotes());
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  const saveInterval = setInterval(async () => {
    await vectorStore.save(semanticService.getNotes());
  }, 5 * 60 * 1e3);
  try {
    await pluginClient.connect();
    logInfo("startup handshake completed");
  } catch (error) {
    const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "startup handshake failed");
    logError(
      `startup handshake failed code=${domainError.code} correlationId=${domainError.correlationId} reason=${pluginClient.getRuntimeStatus().degradedReason ?? "n/a"}`
    );
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// src/index.ts
runServer().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logError(`fatal startup error: ${message}`);
  process.exitCode = 1;
});
