#!/usr/bin/env node

// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// src/infra/pluginClient.ts
import http from "http";
import https from "https";

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
    const port = process.env.OBSIDIAN_PLUGIN_PORT || "3033";
    this.pluginUrl = `http://127.0.0.1:${port}`;
    this.configDir = process.env.OBSIDIAN_CONFIG_DIR || null;
  }
  availability = "unavailable";
  degradedReason = "startup_not_attempted";
  lastCorrelationId = null;
  retryCount = 0;
  pluginUrl;
  configDir = null;
  async connect() {
    this.retryCount = 0;
    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      this.retryCount = attempt;
      try {
        const result = await this.performHandshake();
        const receivedProtocolVersion = result.protocolVersion ?? PROTOCOL_VERSION;
        if (receivedProtocolVersion !== this.expectedProtocolVersion) {
          const error = new DomainError(
            "CONFLICT",
            `Protocol version mismatch: expected ${this.expectedProtocolVersion}, got ${receivedProtocolVersion}`
          );
          this.transition("degraded", "protocol_mismatch", error.correlationId);
          throw error;
        }
        if (result.configDir) {
          this.configDir = result.configDir;
          logInfo(`plugin reported config directory: ${this.configDir}`);
        }
        this.transition("normal", null, null);
        logInfo(`plugin connected on attempt ${attempt}/${this.maxRetries}`);
        return result;
      } catch (error) {
        if (error instanceof DomainError && error.code === "CONFLICT") {
          throw error;
        }
        if (attempt < this.maxRetries) {
          logInfo(`plugin handshake retry ${attempt}/${this.maxRetries}`);
          await new Promise((resolve2) => setTimeout(resolve2, 500));
          continue;
        }
        const correlationId = error instanceof DomainError ? error.correlationId : `corr-${Date.now()}`;
        this.transition("degraded", "retry_exhausted", correlationId);
        logInfo("Plugin handshake failed, continuing in degraded mode.");
        return {
          capabilities: [],
          availability: "degraded"
        };
      }
    }
    return {
      capabilities: [],
      availability: "degraded"
    };
  }
  getAvailability() {
    return this.availability;
  }
  getConfigDir() {
    return this.configDir;
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
    try {
      const json = await this.postJson(request);
      if (isJsonRpcFailure(json)) {
        this.transition("normal", null, null);
        throw new DomainError(
          json.error.code,
          json.error.message,
          json.error.data?.correlationId
        );
      }
      this.transition("normal", null, null);
      return json.result;
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }
      const correlationId = error instanceof DomainError ? error.correlationId : `corr-${Date.now()}`;
      this.transition("degraded", "plugin_unavailable", correlationId);
      throw new DomainError("UNAVAILABLE", "Plugin communication failed", correlationId);
    }
  }
  async performHandshake() {
    const request = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "health.ping",
      protocolVersion: PROTOCOL_VERSION
    };
    const json = await this.postJson(request);
    if (isJsonRpcFailure(json)) {
      throw new Error(json.error.message);
    }
    return json.result;
  }
  async postJson(request) {
    const url = new URL(this.pluginUrl);
    const transport = url.protocol === "https:" ? https : http;
    return new Promise((resolve2, reject) => {
      const payload = JSON.stringify(request);
      const httpRequest = transport.request(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload)
          }
        },
        (response) => {
          const chunks = [];
          response.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          response.on("end", () => {
            const rawBody = Buffer.concat(chunks).toString("utf8");
            if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error(`HTTP error! status: ${response.statusCode ?? "unknown"}`));
              return;
            }
            try {
              resolve2(JSON.parse(rawBody));
            } catch (error) {
              reject(error instanceof Error ? error : new Error("Failed to parse plugin response"));
            }
          });
        }
      );
      httpRequest.on("error", reject);
      httpRequest.write(payload);
      httpRequest.end();
    });
  }
  transition(availability, degradedReason, correlationId) {
    this.availability = availability;
    this.degradedReason = degradedReason;
    this.lastCorrelationId = correlationId;
  }
};

// ../shared/editorPositions.ts
function getEditorLines(content) {
  return content.split("\n");
}
function compareEditorPositions(a, b) {
  if (a.line !== b.line) {
    return a.line - b.line;
  }
  return a.ch - b.ch;
}
function validateEditorPosition(content, position, label = "Position") {
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
function validateEditorRange(content, range) {
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
    const validationError = validateEditorPosition(this.context.content, position, "Insert position");
    if (validationError) {
      throw new DomainError("VALIDATION", validationError);
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
    const validationError = validateEditorRange(this.context.content, range);
    if (validationError) {
      throw new DomainError("VALIDATION", validationError);
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
import path2 from "path";
import fs2 from "fs";

// src/infra/configDir.ts
import fs from "fs";
import path from "path";
function discoverVaultConfigDir(vaultPath) {
  try {
    const entries = fs.readdirSync(vaultPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(".")) {
        continue;
      }
      const pluginsDir = path.join(vaultPath, entry.name, "plugins");
      if (fs.existsSync(pluginsDir)) {
        return entry.name;
      }
    }
  } catch {
    return null;
  }
  return null;
}
function resolvePluginStoragePath(vaultPath, configDir, ...segments) {
  const normalizedConfigDir = configDir?.trim();
  const pluginRoot = normalizedConfigDir ? path.join(vaultPath, normalizedConfigDir, "plugins", "companion-mcp") : path.join(vaultPath, "plugins", "companion-mcp");
  return path.join(pluginRoot, ...segments);
}

// src/domain/embeddingProvider.ts
var LocalEmbeddingProvider = class {
  kind = "local";
  extractor = null;
  modelName = "Xenova/multilingual-e5-small";
  modelDir;
  vaultPath;
  configDir;
  constructor(vaultPath, configDir) {
    this.vaultPath = vaultPath;
    this.configDir = configDir;
    this.modelDir = resolvePluginStoragePath(vaultPath, configDir, "models");
    this.applyModelPath();
  }
  /**
   * Updates the model directory dynamically (called after plugin handshake).
   */
  updateModelPath(vaultPath, configDir) {
    this.vaultPath = vaultPath;
    this.configDir = configDir;
    this.modelDir = resolvePluginStoragePath(vaultPath, configDir, "models");
    this.applyModelPath();
  }
  applyModelPath() {
    if (!fs2.existsSync(this.modelDir)) {
      fs2.mkdirSync(this.modelDir, { recursive: true });
    }
    env.allowRemoteModels = false;
    env.localModelPath = this.modelDir;
    env.cacheDir = this.modelDir;
  }
  async isReady() {
    const modelPath = path2.join(this.modelDir, this.modelName);
    try {
      await fs2.promises.access(modelPath);
      return true;
    } catch {
      return false;
    }
  }
  getRuntimeState() {
    return {
      modelReady: this.extractor !== null || fs2.existsSync(path2.join(this.modelDir, this.modelName))
    };
  }
  async prepare() {
    if (this.extractor) return;
    try {
      env.allowRemoteModels = true;
      this.extractor = await pipeline("feature-extraction", this.modelName);
      env.allowRemoteModels = false;
    } catch (error) {
      env.allowRemoteModels = false;
      throw error;
    }
  }
  async getExtractor() {
    if (!this.extractor) {
      try {
        this.extractor = await pipeline("feature-extraction", this.modelName);
      } catch (error) {
        throw new Error(`Model not found locally. Please run 'refresh_semantic_index' to download models. (Details: ${String(error)})`);
      }
    }
    return this.extractor;
  }
  /**
   * Generate embeddings using multilingual-e5-small.
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
  isReady() {
    return Promise.resolve(true);
  }
  prepare() {
    return Promise.resolve();
  }
  getRuntimeState() {
    return { modelReady: true };
  }
  embed(text, _isQuery = false) {
    const normalized = text.trim().toLowerCase();
    const score = normalized.length + 1;
    return Promise.resolve([score, score / 2, score / 4]);
  }
};
function createEmbeddingProvider(preferRemote = false, vaultPath = "", configDir = "") {
  if (preferRemote) {
    return new RemoteEmbeddingProvider();
  }
  const effectiveVaultPath = vaultPath || "/tmp";
  const effectiveConfigDir = configDir || process.env.OBSIDIAN_CONFIG_DIR || discoverVaultConfigDir(effectiveVaultPath) || "";
  return new LocalEmbeddingProvider(effectiveVaultPath, effectiveConfigDir);
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
  getPendingSample(limit) {
    return this.queue.slice(0, Math.max(limit, 0)).map((job) => job.path);
  }
  enqueue(job) {
    const existingIndex = this.queue.findIndex((item) => item.path === job.path);
    if (existingIndex !== -1) {
      if (this.queue[existingIndex].updatedAt >= job.updatedAt) {
        return false;
      }
      this.queue.splice(existingIndex, 1);
    }
    this.queue.push(job);
    return true;
  }
  renamePath(from, to) {
    const existingIndex = this.queue.findIndex((item) => item.path === from);
    if (existingIndex === -1) {
      return;
    }
    this.queue[existingIndex] = {
      ...this.queue[existingIndex],
      path: to
    };
  }
  removePath(path5) {
    const existingIndex = this.queue.findIndex((item) => item.path === path5);
    if (existingIndex !== -1) {
      this.queue.splice(existingIndex, 1);
    }
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
function toExcerpt(content, maxLength = 240) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(maxLength - 3, 0))}...`;
}
var SemanticService = class {
  notes = /* @__PURE__ */ new Map();
  queue = new IndexingQueue();
  provider;
  constructor(preferRemote = false, vaultPath = "", configDir = "") {
    this.provider = createEmbeddingProvider(preferRemote, vaultPath, configDir);
  }
  queueIndex(path5, snippet, updatedAt) {
    return this.queue.enqueue({ path: path5, content: snippet, updatedAt });
  }
  async flushIndex(maxItems = 25) {
    return this.queue.process(async (job) => {
      const embedding = await this.provider.embed(job.content, false);
      this.notes.set(job.path, {
        path: job.path,
        snippet: toExcerpt(job.content),
        updatedAt: job.updatedAt,
        embedding
      });
    }, maxItems);
  }
  upsert(path5, snippet, updatedAt) {
    const existing = this.notes.get(path5);
    if (existing && existing.updatedAt >= updatedAt) {
      return false;
    }
    return this.queueIndex(path5, snippet, updatedAt);
  }
  remove(path5) {
    this.notes.delete(path5);
    this.queue.removePath(path5);
  }
  movePath(from, to) {
    const existing = this.notes.get(from);
    if (existing) {
      this.notes.delete(from);
      this.notes.set(to, {
        ...existing,
        path: to
      });
    }
    this.queue.renamePath(from, to);
  }
  getIndexStatus(sampleLimit = 20) {
    const pendingCount = this.queue.getPendingCount();
    const indexedCount = this.notes.size;
    return {
      pendingCount,
      indexedCount,
      running: this.queue.isRunning(),
      ready: pendingCount === 0,
      isEmpty: indexedCount === 0,
      modelReady: this.provider.getRuntimeState().modelReady,
      pendingSample: this.queue.getPendingSample(sampleLimit)
    };
  }
  async prepareModel() {
    await this.provider.prepare();
  }
  async isModelReady() {
    return this.provider.isReady();
  }
  async searchWithStatus(query, limit) {
    if (this.queue.getPendingCount() > 0) {
      await this.flushIndex(Math.max(limit * 2, 10));
    }
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
        excerpt: toExcerpt(note.snippet),
        score
      };
    }).sort((a, b) => b.score - a.score).slice(0, limit);
  }
  getProvider() {
    return this.provider;
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
import * as fs3 from "fs";
import * as path3 from "path";

// ../shared/frontmatter.ts
function detectEol(content) {
  return content.includes("\r\n") ? "\r\n" : "\n";
}
function quoteYamlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
function parseQuotedString(rawValue) {
  if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
    return rawValue.slice(1, -1).replaceAll("''", "'");
  }
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    try {
      return JSON.parse(rawValue);
    } catch {
      return rawValue.slice(1, -1);
    }
  }
  return rawValue;
}
function parseScalar(rawValue) {
  const normalized = rawValue.trim();
  if (normalized === "null") {
    return null;
  }
  if (normalized === "true" || normalized === "false") {
    return normalized === "true";
  }
  if (normalized.startsWith("'") && normalized.endsWith("'") || normalized.startsWith('"') && normalized.endsWith('"')) {
    return parseQuotedString(normalized);
  }
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    try {
      const parsed = JSON.parse(normalized);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
    }
  }
  if (normalized !== "" && !Number.isNaN(Number(normalized))) {
    return Number(normalized);
  }
  return normalized;
}
function formatScalar(value) {
  if (typeof value === "string") {
    const safePlain = value.length > 0 && !value.includes("\n") && !value.includes("\r") && !value.includes(":") && !value.includes("#") && !value.startsWith(" ") && !value.endsWith(" ") && value !== "null" && value !== "true" && value !== "false";
    return safePlain ? value : quoteYamlString(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "null";
}
function renderArrayItem(value) {
  if (Array.isArray(value)) {
    return quoteYamlString(JSON.stringify(value));
  }
  return formatScalar(value);
}
function renderEntry(key, value, eol) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${key}: []`;
    }
    return `${key}:${eol}${value.map((item) => `  - ${renderArrayItem(item)}`).join(eol)}`;
  }
  return `${key}: ${formatScalar(value)}`;
}
function renderFrontmatter(metadata, eol) {
  const entries = Object.entries(metadata);
  if (entries.length === 0) {
    return "";
  }
  const lines = entries.map(([key, value]) => renderEntry(key, value, eol));
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
  const lines = matched[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
      continue;
    }
    const separator = rawLine.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const key = rawLine.slice(0, separator).trim();
    const rawValue = rawLine.slice(separator + 1).trim();
    if (!key) {
      continue;
    }
    if (rawValue === "") {
      const items = [];
      let cursor = i + 1;
      while (cursor < lines.length) {
        const itemLine = lines[cursor];
        const itemMatch = itemLine.match(/^\s*-\s+(.*)$/);
        if (!itemMatch) {
          break;
        }
        items.push(parseScalar(itemMatch[1]));
        cursor++;
      }
      if (items.length > 0) {
        metadata[key] = items;
        i = cursor - 1;
        continue;
      }
    }
    metadata[key] = parseScalar(rawValue);
  }
  return metadata;
}
function hasFrontmatter(content) {
  return /^\s*---\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n)?/.test(content);
}
function applyFrontmatter(content, metadata) {
  const eol = detectEol(content);
  const body = stripFrontmatter(content);
  const frontmatter = renderFrontmatter(metadata, eol);
  return frontmatter ? `${frontmatter}${body}` : body;
}

// src/infra/fallbackStorage.ts
var VAULT_PATH_ENV = "OBSIDIAN_VAULT_PATH";
function getVaultRoot() {
  const configured = process.env[VAULT_PATH_ENV]?.trim();
  if (!configured) {
    throw new DomainError("UNAVAILABLE", `${VAULT_PATH_ENV} is required for note operations`);
  }
  return path3.resolve(configured);
}
function normalizeVaultRelativePath(notePath, allowEmpty = false) {
  if (!notePath) {
    if (allowEmpty) {
      return "";
    }
    throw new DomainError("VALIDATION", "path is required");
  }
  const normalized = path3.posix.normalize(notePath.replaceAll("\\", "/"));
  if (allowEmpty && (normalized === "." || normalized === "")) {
    return "";
  }
  if (normalized.startsWith("/") || normalized === ".." || normalized.startsWith("../")) {
    throw new DomainError("VALIDATION", `Invalid vault-relative path: ${notePath}`);
  }
  return normalized === "." ? "" : normalized;
}
function resolveVaultPath(notePath, allowEmpty = false) {
  const normalized = normalizeVaultRelativePath(notePath, allowEmpty);
  const vaultRoot = getVaultRoot();
  const resolved = normalized ? path3.resolve(vaultRoot, normalized) : vaultRoot;
  const relative2 = path3.relative(vaultRoot, resolved);
  if (relative2 === ".." || relative2.startsWith(`..${path3.sep}`) || path3.isAbsolute(relative2)) {
    throw new DomainError("VALIDATION", `Path escapes vault root: ${notePath}`);
  }
  return resolved;
}
function ensureParentDir(filePath) {
  const dir = path3.dirname(filePath);
  fs3.mkdirSync(dir, { recursive: true });
}
function readNote(path5) {
  const filePath = resolveVaultPath(path5);
  if (!fs3.existsSync(filePath)) {
    return void 0;
  }
  const content = fs3.readFileSync(filePath, "utf8");
  return {
    content,
    metadata: parseFrontmatter(content)
  };
}
function writeNote(path5, content) {
  const filePath = resolveVaultPath(path5);
  const existing = readNote(path5);
  const metadata = hasFrontmatter(content) ? parseFrontmatter(content) : existing?.metadata ?? {};
  const next = {
    content: hasFrontmatter(content) ? content : applyFrontmatter(content, metadata),
    metadata
  };
  ensureParentDir(filePath);
  fs3.writeFileSync(filePath, next.content, "utf8");
  return next;
}
function updateMetadata(path5, metadata) {
  const filePath = resolveVaultPath(path5);
  const existing = readNote(path5) ?? { content: "", metadata: {} };
  const mergedMetadata = { ...existing.metadata, ...metadata };
  const next = {
    content: applyFrontmatter(existing.content, mergedMetadata),
    metadata: mergedMetadata
  };
  ensureParentDir(filePath);
  fs3.writeFileSync(filePath, next.content, "utf8");
  return next;
}
function deleteNote(path5) {
  const filePath = resolveVaultPath(path5);
  if (!fs3.existsSync(filePath)) {
    return false;
  }
  fs3.rmSync(filePath);
  return true;
}
function compareEntries(a, b) {
  if (a.kind !== b.kind) {
    return a.kind === "directory" ? -1 : 1;
  }
  return a.path.localeCompare(b.path, "en");
}
function encodeCursor(entry) {
  return Buffer.from(JSON.stringify({ path: entry.path, kind: entry.kind }), "utf8").toString("base64url");
}
function decodeCursor(cursor) {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!decoded.path || decoded.kind !== "file" && decoded.kind !== "directory") {
      throw new Error("invalid cursor");
    }
    return { path: decoded.path, kind: decoded.kind };
  } catch {
    throw new DomainError("VALIDATION", "Invalid list cursor");
  }
}
function listEntries(dirPath, options = {}) {
  const rootPath = resolveVaultPath(dirPath, true);
  if (!fs3.existsSync(rootPath)) {
    throw new DomainError("NOT_FOUND", `Directory not found: ${dirPath || "."}`);
  }
  const stats = fs3.statSync(rootPath);
  if (!stats.isDirectory()) {
    throw new DomainError("VALIDATION", `Path is not a directory: ${dirPath || "."}`);
  }
  const recursive = options.recursive ?? false;
  const includeDirs = options.includeDirs ?? true;
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const vaultRoot = getVaultRoot();
  const results = [];
  function scan(dir) {
    const entries2 = fs3.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries2) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = path3.join(dir, entry.name);
      const entryStats = fs3.statSync(fullPath);
      const relativePath = path3.relative(vaultRoot, fullPath).split(path3.sep).join("/");
      if (entry.isDirectory()) {
        if (includeDirs) {
          results.push({
            path: relativePath,
            name: entry.name,
            kind: "directory",
            updatedAt: entryStats.mtimeMs,
            size: 0
          });
        }
        if (recursive) {
          scan(fullPath);
        }
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }
      results.push({
        path: relativePath,
        name: entry.name,
        kind: "file",
        updatedAt: entryStats.mtimeMs,
        size: entryStats.size
      });
    }
  }
  scan(rootPath);
  results.sort(compareEntries);
  let startIndex = 0;
  if (options.cursor) {
    const cursor = decodeCursor(options.cursor);
    startIndex = results.findIndex((entry) => compareEntries(entry, {
      path: cursor.path,
      kind: cursor.kind,
      name: "",
      updatedAt: 0,
      size: 0
    }) > 0);
    if (startIndex === -1) {
      startIndex = results.length;
    }
  }
  const entries = results.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + entries.length < results.length;
  return {
    entries,
    nextCursor: hasMore && entries.length > 0 ? encodeCursor(entries[entries.length - 1]) : null,
    hasMore,
    truncated: hasMore
  };
}
function moveNote(fromPath, toPath) {
  const sourcePath = resolveVaultPath(fromPath);
  const destinationPath = resolveVaultPath(toPath);
  if (!fs3.existsSync(sourcePath)) {
    return false;
  }
  if (fs3.existsSync(destinationPath)) {
    throw new DomainError("CONFLICT", `Destination already exists: ${toPath}`);
  }
  const sourceStats = fs3.statSync(sourcePath);
  if (!sourceStats.isFile()) {
    throw new DomainError("VALIDATION", `Path is not a note file: ${fromPath}`);
  }
  ensureParentDir(destinationPath);
  fs3.renameSync(sourcePath, destinationPath);
  return true;
}
function listNotes() {
  const vaultRoot = getVaultRoot();
  const results = [];
  function scan(dir) {
    const entries = fs3.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path3.join(dir, entry.name);
      const relativePath = path3.relative(vaultRoot, fullPath);
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) {
          continue;
        }
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const stats = fs3.statSync(fullPath);
        const content = fs3.readFileSync(fullPath, "utf8");
        results.push({
          path: relativePath,
          updatedAt: stats.mtimeMs,
          content
        });
      }
    }
  }
  if (fs3.existsSync(vaultRoot)) {
    scan(vaultRoot);
  }
  return results;
}

// src/domain/noteService.ts
var NoteService = class {
  constructor(pluginClient, semanticService) {
    this.pluginClient = pluginClient;
    this.semanticService = semanticService;
  }
  async read(path5) {
    try {
      await this.pluginClient.send("notes.read", { path: path5 });
      const hit = readNote(path5);
      if (!hit) {
        throw new DomainError("NOT_FOUND", `Note not found: ${path5}`);
      }
      return { content: hit.content, metadata: hit.metadata, degraded: false, degradedReason: null };
    } catch {
      const hit = readNote(path5);
      if (!hit) {
        throw new DomainError("NOT_FOUND", `Note not found: ${path5}`);
      }
      return {
        content: hit.content,
        metadata: hit.metadata,
        degraded: true,
        degradedReason: "plugin_unavailable"
      };
    }
  }
  async write(path5, content) {
    if (!path5) {
      throw new DomainError("VALIDATION", "path is required");
    }
    try {
      await this.pluginClient.send("notes.write", { path: path5, content });
      const record = writeNote(path5, content);
      this.semanticService?.upsert(path5, record.content, Date.now());
      return { path: path5, degraded: false, degradedReason: null };
    } catch {
      const record = writeNote(path5, content);
      this.semanticService?.upsert(path5, record.content, Date.now());
      return { path: path5, degraded: true, degradedReason: "plugin_unavailable" };
    }
  }
  async delete(path5) {
    try {
      await this.pluginClient.send("notes.delete", { path: path5 });
      this.semanticService?.remove(path5);
      return { deleted: true, degraded: false, degradedReason: null };
    } catch (error) {
      const deleted = deleteNote(path5);
      if (deleted) {
        this.semanticService?.remove(path5);
        return { deleted: true, degraded: true, degradedReason: "plugin_unavailable" };
      }
      if (error instanceof DomainError && error.code === "NOT_FOUND") {
        throw error;
      }
      throw new DomainError("NOT_FOUND", `Note not found: ${path5}`);
    }
  }
  async updateMetadata(path5, metadata) {
    try {
      await this.pluginClient.send("metadata.update", { path: path5, metadata });
      const record = updateMetadata(path5, metadata);
      this.semanticService?.upsert(path5, record.content, Date.now());
      return { path: path5, metadata: record.metadata, degraded: false, degradedReason: null };
    } catch {
      const record = updateMetadata(path5, metadata);
      this.semanticService?.upsert(path5, record.content, Date.now());
      return {
        path: path5,
        metadata: record.metadata,
        degraded: true,
        degradedReason: "plugin_unavailable"
      };
    }
  }
  async list(path5, options) {
    const result = listEntries(path5, options);
    return {
      path: path5,
      ...result,
      degraded: false,
      degradedReason: null
    };
  }
  async move(from, to) {
    try {
      await this.pluginClient.send("notes.move", { from, to });
      this.semanticService?.movePath(from, to);
      return { from, to, degraded: false, degradedReason: null };
    } catch {
      const moved = moveNote(from, to);
      if (!moved) {
        throw new DomainError("NOT_FOUND", `Note not found: ${from}`);
      }
      this.semanticService?.movePath(from, to);
      return { from, to, degraded: true, degradedReason: "plugin_unavailable" };
    }
  }
  async getIndexStatus(pendingSampleLimit) {
    if (!this.semanticService) {
      return {
        pendingCount: 0,
        indexedCount: 0,
        running: false,
        ready: false,
        isEmpty: true,
        modelReady: false,
        pendingSample: []
      };
    }
    return this.semanticService.getIndexStatus(pendingSampleLimit);
  }
  async refreshIndex() {
    if (!this.semanticService) {
      return {
        totalFound: 0,
        queuedCount: 0,
        flushedCount: 0,
        pendingCount: 0,
        indexedCount: 0,
        modelReady: false
      };
    }
    await this.semanticService.prepareModel();
    const notes = listNotes();
    let queuedCount = 0;
    for (const note of notes) {
      const wasUpdated = this.semanticService.upsert(note.path, note.content, note.updatedAt);
      if (wasUpdated) {
        queuedCount++;
      }
    }
    const flushedCount = queuedCount > 0 ? await this.semanticService.flushIndex(5) : 0;
    const indexStatus = this.semanticService.getIndexStatus();
    return {
      totalFound: notes.length,
      queuedCount,
      flushedCount,
      pendingCount: indexStatus.pendingCount,
      indexedCount: indexStatus.indexedCount,
      modelReady: true
    };
  }
};

// src/infra/vectorStore.ts
import { promises as fs4 } from "fs";
import path4 from "path";
var VectorStore = class {
  indexPath;
  vaultPath;
  configDir;
  constructor(vaultPath, configDir) {
    this.vaultPath = vaultPath;
    this.configDir = configDir;
    this.indexPath = path4.join(vaultPath, configDir, "plugins", "companion-mcp", "data", "semantic-index.json");
  }
  /**
   * Updates the index path dynamically (called after plugin handshake).
   */
  updateIndexPath(vaultPath, configDir) {
    this.vaultPath = vaultPath;
    this.configDir = configDir;
    this.indexPath = path4.join(vaultPath, configDir, "plugins", "companion-mcp", "data", "semantic-index.json");
  }
  async load() {
    try {
      try {
        await fs4.access(this.indexPath);
      } catch {
        return /* @__PURE__ */ new Map();
      }
      const raw = await fs4.readFile(this.indexPath, "utf-8");
      const data = JSON.parse(raw);
      logInfo(`vector index loaded: ${data.length} notes from ${this.indexPath}`);
      return new Map(data);
    } catch (error) {
      logError(`failed to load vector index: ${String(error)}`);
      return /* @__PURE__ */ new Map();
    }
  }
  async save(notes) {
    try {
      const dir = path4.dirname(this.indexPath);
      await fs4.mkdir(dir, { recursive: true });
      const data = Array.from(notes.entries());
      await fs4.writeFile(this.indexPath, JSON.stringify(data), "utf-8");
      logInfo(`vector index saved: ${notes.size} notes to ${this.indexPath}`);
    } catch (error) {
      logError(`failed to save vector index: ${String(error)}`);
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
  REFRESH_SEMANTIC_INDEX: "refresh_semantic_index",
  GET_ACTIVE_CONTEXT: "get_active_context",
  INSERT_AT_CURSOR: "insert_at_cursor",
  REPLACE_RANGE: "replace_range",
  LIST_NOTES: "list_notes",
  MOVE_NOTE: "move_note",
  GET_INDEX_STATUS: "get_index_status",
  CREATE_NOTE: "create_note",
  GET_NOTE: "get_note",
  UPDATE_NOTE_CONTENT: "update_note_content",
  DELETE_NOTE: "delete_note",
  UPDATE_NOTE_METADATA: "update_note_metadata"
};
var TOOL_NAME_LIST = [
  TOOL_NAMES.SEARCH_NOTES_SEMANTIC,
  TOOL_NAMES.REFRESH_SEMANTIC_INDEX,
  TOOL_NAMES.GET_ACTIVE_CONTEXT,
  TOOL_NAMES.INSERT_AT_CURSOR,
  TOOL_NAMES.REPLACE_RANGE,
  TOOL_NAMES.LIST_NOTES,
  TOOL_NAMES.MOVE_NOTE,
  TOOL_NAMES.GET_INDEX_STATUS,
  TOOL_NAMES.CREATE_NOTE,
  TOOL_NAMES.GET_NOTE,
  TOOL_NAMES.UPDATE_NOTE_CONTENT,
  TOOL_NAMES.DELETE_NOTE,
  TOOL_NAMES.UPDATE_NOTE_METADATA
];

// src/tools/semanticSearch.ts
var searchNotesSemanticInputSchema = z.object({
  query: z.string().describe("Natural language search query (multilingual)"),
  limit: z.number().optional().default(10).describe("Maximum number of results to return")
});
function registerSemanticSearchTool(server, semanticService) {
  server.registerTool(
    TOOL_NAMES.SEARCH_NOTES_SEMANTIC,
    {
      description: "Perform semantic (vector-based) search on your notes.",
      inputSchema: searchNotesSemanticInputSchema
    },
    async (params) => {
      try {
        const result = await semanticService.searchWithStatus(params.query, params.limit);
        let summary;
        let instructions = null;
        if (result.indexStatus.isEmpty) {
          summary = "\u274C Vault has not been indexed yet. Semantic search is unavailable.";
          instructions = "Please run the 'refresh_semantic_index' tool. Note: This may take several minutes for large vaults as it downloads models and generates embeddings.";
        } else if (!result.indexStatus.modelReady) {
          summary = "\u26A0\uFE0F Semantic model is not loaded. Generating first search result may take a moment.";
          instructions = "The model will be loaded from disk on the first search. If you deleted the 'models' directory, you must run 'refresh_semantic_index' to re-download it.";
        } else if (result.matches.length > 0) {
          summary = `\u2705 Found ${result.matches.length} candidate notes. Use 'get_note' for full content.`;
        } else if (result.indexStatus.ready) {
          summary = "\u2753 No semantic matches found for this query.";
        } else {
          summary = `\u23F3 Indexing in progress (${result.indexStatus.pendingCount} notes remaining). Results may be incomplete.`;
        }
        return okResult(summary, {
          ...result,
          instructions,
          degraded: false,
          degradedReason: null
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("Model not found locally")) {
          return okResult("\u274C Semantic search unavailable: Model not found locally.", {
            matches: [],
            indexStatus: semanticService.getIndexStatus(),
            instructions: "Please run 'refresh_semantic_index' to download the required models.",
            degraded: true,
            degradedReason: "model_missing"
          });
        }
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", `semantic search failed: ${message}`);
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
  const toMutationPayload = (result) => ({
    activeFile: typeof result.context.activeFile === "string" ? result.context.activeFile : null,
    cursor: result.context.cursor ?? null,
    selection: typeof result.context.selection === "string" ? result.context.selection : "",
    degraded: result.degraded,
    degradedReason: result.degradedReason,
    noActiveEditor: result.noActiveEditor,
    editorState: result.noActiveEditor ? "none" : "active"
  });
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
        return okResult(`Text inserted (${result.degraded ? "degraded" : "normal"})`, toMutationPayload(result));
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
        return okResult(`Range replaced (${result.degraded ? "degraded" : "normal"})`, toMutationPayload(result));
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "replace failed");
        return errorResult(domainError);
      }
    }
  );
}

// src/tools/noteManagement.ts
import { z as z4 } from "zod";
var createNoteInputSchema = z4.object({
  path: z4.string().describe("Vault-relative path (e.g., 'notes/idea.md')"),
  content: z4.string().describe("Full markdown content")
});
var getNoteInputSchema = z4.object({
  path: z4.string().describe("Vault-relative path")
});
var listNotesInputSchema = z4.object({
  path: z4.string().optional().default("").describe("Vault-relative directory path. Empty string means vault root."),
  cursor: z4.string().optional().describe("Opaque continuation cursor from a previous list_notes result"),
  limit: z4.number().int().min(1).max(500).optional().default(100).describe("Maximum number of entries to return"),
  recursive: z4.boolean().optional().default(false).describe("Whether to recurse into subdirectories"),
  includeDirs: z4.boolean().optional().default(true).describe("Whether to include directories in the results")
});
var moveNoteInputSchema = z4.object({
  from: z4.string().describe("Existing vault-relative note path"),
  to: z4.string().describe("Destination vault-relative note path")
});
var getIndexStatusInputSchema = z4.object({
  pendingSampleLimit: z4.number().int().min(1).max(50).optional().default(20).describe("Maximum number of pending paths to sample")
});
var updateNoteContentInputSchema = z4.object({
  path: z4.string().describe("Vault-relative path"),
  content: z4.string().describe("New full content")
});
var deleteNoteInputSchema = z4.object({
  path: z4.string().describe("Vault-relative markdown note path to delete")
});
var updateNoteMetadataInputSchema = z4.object({
  path: z4.string().describe("Vault-relative path"),
  metadata: z4.record(z4.any()).describe("Key-value pairs for frontmatter")
});
var refreshSemanticIndexInputSchema = z4.object({});
function registerNoteTool(server, noteService) {
  server.registerTool(
    TOOL_NAMES.REFRESH_SEMANTIC_INDEX,
    {
      description: "Build or rebuild the semantic index. This involves downloading models (if missing) and scanning all notes. This is a heavy operation for large vaults.",
      inputSchema: refreshSemanticIndexInputSchema
    },
    async (params) => {
      try {
        const stats = await noteService.refreshIndex();
        let summary = "\u2705 Semantic indexing queued.";
        if (!stats.modelReady) {
          summary = "\u274C Failed to prepare the embedding model.";
        } else if (stats.queuedCount > 0) {
          summary += ` Found ${stats.totalFound} notes. Queued ${stats.queuedCount} note(s), processed ${stats.flushedCount} immediately, and ${stats.pendingCount} remain pending.`;
        } else {
          summary += ` Index is already up-to-date with ${stats.totalFound} notes.`;
        }
        return okResult(summary, stats);
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "refresh index failed");
        return errorResult(domainError);
      }
    }
  );
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
    TOOL_NAMES.LIST_NOTES,
    {
      description: "List notes and directories under a vault-relative folder with bounded, cursor-based pagination.",
      inputSchema: listNotesInputSchema,
      annotations: {
        readOnlyHint: true
      }
    },
    async (params) => {
      try {
        const result = await noteService.list(params.path, {
          cursor: params.cursor,
          limit: params.limit,
          recursive: params.recursive,
          includeDirs: params.includeDirs
        });
        return okResult(`Listed ${result.entries.length} entries`, result);
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "list notes failed");
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
    TOOL_NAMES.MOVE_NOTE,
    {
      description: "Move or rename a note within the vault without leaving the vault root.",
      inputSchema: moveNoteInputSchema
    },
    async (params) => {
      try {
        const result = await noteService.move(params.from, params.to);
        return okResult(`Moved note (${result.degraded ? "degraded" : "normal"})`, result);
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "move note failed");
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
  server.registerTool(
    TOOL_NAMES.GET_INDEX_STATUS,
    {
      description: "Inspect semantic index readiness, queue depth, and a bounded sample of pending note paths.",
      inputSchema: getIndexStatusInputSchema,
      annotations: {
        readOnlyHint: true
      }
    },
    async (params) => {
      try {
        const result = await noteService.getIndexStatus(params.pendingSampleLimit);
        return okResult("Retrieved semantic index status", result);
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "get index status failed");
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
    (uri) => ({
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
    (uri) => ({
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
    (uri) => ({
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
    (uri) => ({
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
    (uri) => ({
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
    (args) => {
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
    (args) => ({
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
    (args) => ({
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
function createServer(runtimePaths, pluginClient = new PluginClient()) {
  const server = new McpServer({
    name: "obsidian-companion-mcp",
    version: "0.1.0"
  });
  const useRemote = process.env.USE_REMOTE_EMBEDDING === "true";
  const semanticService = new SemanticService(useRemote, runtimePaths.vaultPath, runtimePaths.configDir);
  const vectorStore = new VectorStore(runtimePaths.vaultPath, runtimePaths.configDir);
  const editorService = new EditorService(pluginClient);
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
async function resolveRuntimePaths(pluginClient) {
  const envVaultPath = process.env.OBSIDIAN_VAULT_PATH?.trim();
  const envConfigDir = process.env.OBSIDIAN_CONFIG_DIR?.trim();
  let handshake = null;
  try {
    handshake = await pluginClient.connect();
    logInfo("startup handshake completed");
  } catch (error) {
    const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "startup handshake failed");
    logError(
      `startup handshake failed code=${domainError.code} correlationId=${domainError.correlationId} reason=${pluginClient.getRuntimeStatus().degradedReason ?? "n/a"}`
    );
  }
  const vaultPath = envVaultPath ?? handshake?.vaultPath;
  if (!vaultPath) {
    throw new DomainError(
      "VALIDATION",
      "Missing required vault path. Set OBSIDIAN_VAULT_PATH or start the Obsidian Companion plugin so the vault can be discovered automatically."
    );
  }
  const configDir = envConfigDir ?? handshake?.configDir ?? pluginClient.getConfigDir() ?? discoverVaultConfigDir(vaultPath) ?? "";
  if (!process.env.OBSIDIAN_VAULT_PATH) {
    process.env.OBSIDIAN_VAULT_PATH = vaultPath;
    logInfo(`applying dynamic configuration: vaultPath=${vaultPath}`);
  }
  if (configDir && !process.env.OBSIDIAN_CONFIG_DIR) {
    process.env.OBSIDIAN_CONFIG_DIR = configDir;
    logInfo(`applying dynamic configuration: configDir=${configDir}`);
  }
  return { vaultPath, configDir, handshake };
}
async function runServer() {
  const pluginClient = new PluginClient();
  const runtimePaths = await resolveRuntimePaths(pluginClient);
  const { server, semanticService, vectorStore } = createServer(runtimePaths, pluginClient);
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
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// src/index.ts
runServer().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logError(`fatal startup error: ${message}`);
  process.exitCode = 1;
});
