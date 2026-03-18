"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ObsidianCompanionPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var http = __toESM(require("http"));

// ../shared/protocol.ts
var PROTOCOL_VERSION = "1.0.0";

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
  var _a, _b;
  if (position.line < 0 || position.ch < 0) {
    return `${label} must be non-negative`;
  }
  const lines = getEditorLines(content);
  if (position.line >= lines.length) {
    return `${label} line ${position.line} exceeds content line count ${lines.length}`;
  }
  const lineLength = (_b = (_a = lines[position.line]) == null ? void 0 : _a.length) != null ? _b : 0;
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

// ../shared/frontmatter.ts
function detectEol(content) {
  return content.includes("\r\n") ? "\r\n" : "\n";
}
function quoteYamlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
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
function applyFrontmatter(content, metadata) {
  const eol = detectEol(content);
  const body = stripFrontmatter(content);
  const frontmatter = renderFrontmatter(metadata, eol);
  return frontmatter ? `${frontmatter}${body}` : body;
}

// src/main.ts
var DEFAULT_SETTINGS = {
  port: 3033
};
var MIN_PORT = 1024;
var MAX_PORT = 49151;
function isMissingVaultFileError(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
var LocalJsonRpcHost = class {
  constructor(plugin) {
    this.plugin = plugin;
  }
  async handle(request) {
    const { method, id } = request;
    try {
      switch (method) {
        case "health.ping":
          return this.handleHealthPing(id);
        case "editor.getContext":
          return this.handleGetEditorContext(id);
        case "notes.write":
          return this.handleNotesWrite(id, request.params);
        case "notes.read":
          return this.handleNotesRead(id, request.params);
        case "notes.delete":
          return this.handleNotesDelete(id, request.params);
        case "metadata.update":
          return this.handleMetadataUpdate(id, request.params);
        case "editor.applyCommand":
          return this.handleEditorApplyCommand(id, request.params);
        default:
          return this.methodNotFound(id, method);
      }
    } catch (error) {
      return this.handleError(id, error);
    }
  }
  handleHealthPing(id) {
    const result = {
      capabilities: [
        "health.ping",
        "editor.getContext",
        "editor.applyCommand",
        "notes.read",
        "notes.write",
        "notes.delete",
        "metadata.update"
      ],
      availability: "normal",
      configDir: this.plugin.app.vault.configDir,
      vaultPath: this.plugin.getVaultBasePath()
    };
    return { jsonrpc: "2.0", id, protocolVersion: PROTOCOL_VERSION, result };
  }
  handleGetEditorContext(id) {
    var _a, _b;
    const activeView = this.plugin.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    return {
      jsonrpc: "2.0",
      id,
      protocolVersion: PROTOCOL_VERSION,
      result: {
        activeFile: (_b = (_a = activeView == null ? void 0 : activeView.file) == null ? void 0 : _a.path) != null ? _b : null,
        cursor: (activeView == null ? void 0 : activeView.editor) ? activeView.editor.getCursor() : null,
        selection: (activeView == null ? void 0 : activeView.editor) ? activeView.editor.getSelection() : "",
        content: (activeView == null ? void 0 : activeView.editor) ? activeView.editor.getValue() : ""
      }
    };
  }
  async handleNotesWrite(id, params) {
    if (!(params == null ? void 0 : params.path)) {
      return this.validationError(id, "Path is required");
    }
    if (params.content === void 0) {
      return this.validationError(id, "Content is required");
    }
    const file = this.plugin.app.vault.getAbstractFileByPath(params.path);
    if (file) {
      if (!(file instanceof import_obsidian.TFile)) {
        return this.errorResponse(id, "INTERNAL", "Target is not a file");
      }
      await this.plugin.app.vault.modify(file, params.content);
    } else {
      await this.plugin.app.vault.create(params.path, params.content);
    }
    return {
      jsonrpc: "2.0",
      id,
      protocolVersion: PROTOCOL_VERSION,
      result: { success: true }
    };
  }
  async handleNotesRead(id, params) {
    if (!(params == null ? void 0 : params.path)) {
      return this.validationError(id, "Path is required");
    }
    const file = this.plugin.app.vault.getAbstractFileByPath(params.path);
    if (!file || !(file instanceof import_obsidian.TFile)) {
      return this.errorResponse(id, "NOT_FOUND", `Note not found: ${params.path}`);
    }
    let content;
    try {
      content = await this.plugin.app.vault.cachedRead(file);
    } catch (error) {
      if (isMissingVaultFileError(error)) {
        return this.errorResponse(id, "NOT_FOUND", `Note not found: ${params.path}`);
      }
      throw error;
    }
    return {
      jsonrpc: "2.0",
      id,
      protocolVersion: PROTOCOL_VERSION,
      result: { content }
    };
  }
  async handleNotesDelete(id, params) {
    if (!(params == null ? void 0 : params.path)) {
      return this.validationError(id, "Path is required");
    }
    const file = this.plugin.app.vault.getAbstractFileByPath(params.path);
    if (!file) {
      return this.errorResponse(id, "NOT_FOUND", `Note not found: ${params.path}`);
    }
    try {
      await this.plugin.app.vault.delete(file);
    } catch (error) {
      if (isMissingVaultFileError(error)) {
        return this.errorResponse(id, "NOT_FOUND", `Note not found: ${params.path}`);
      }
      throw error;
    }
    return {
      jsonrpc: "2.0",
      id,
      protocolVersion: PROTOCOL_VERSION,
      result: { success: true }
    };
  }
  async handleMetadataUpdate(id, params) {
    if (!(params == null ? void 0 : params.path)) {
      return this.validationError(id, "Path is required");
    }
    if (!(params == null ? void 0 : params.metadata) || typeof params.metadata !== "object") {
      return this.validationError(id, "Valid metadata object is required");
    }
    const file = this.plugin.app.vault.getAbstractFileByPath(params.path);
    if (!file || !(file instanceof import_obsidian.TFile)) {
      return this.errorResponse(id, "NOT_FOUND", `Note not found: ${params.path}`);
    }
    let content;
    try {
      content = await this.plugin.app.vault.cachedRead(file);
    } catch (error) {
      if (isMissingVaultFileError(error)) {
        return this.errorResponse(id, "NOT_FOUND", `Note not found: ${params.path}`);
      }
      throw error;
    }
    const newContent = this.updateFrontmatter(content, params.metadata);
    try {
      await this.plugin.app.vault.modify(file, newContent);
    } catch (error) {
      if (isMissingVaultFileError(error)) {
        return this.errorResponse(id, "NOT_FOUND", `Note not found: ${params.path}`);
      }
      throw error;
    }
    return {
      jsonrpc: "2.0",
      id,
      protocolVersion: PROTOCOL_VERSION,
      result: { success: true }
    };
  }
  handleEditorApplyCommand(id, payload) {
    var _a, _b, _c, _d;
    const activeView = this.plugin.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (!(activeView == null ? void 0 : activeView.editor)) {
      return this.errorResponse(id, "UNAVAILABLE", "No active editor found");
    }
    const content = activeView.editor.getValue();
    if (payload.command === "insertText") {
      const validationError = validateEditorPosition(content, payload.pos, "Insert position");
      if (validationError) {
        return this.validationError(id, validationError);
      }
      activeView.editor.setCursor(payload.pos);
      activeView.editor.replaceSelection(payload.text);
    } else if (payload.command === "replaceRange") {
      const validationError = validateEditorRange(content, payload.range);
      if (validationError) {
        return this.validationError(id, validationError);
      }
      const lines = content.split("\n");
      console.debug("[replaceRange DEBUG]", {
        from: payload.range.from,
        to: payload.range.to,
        text: payload.text,
        "from.line content": lines[payload.range.from.line] || "(undefined)",
        "to.line content": lines[payload.range.to.line] || "(undefined)",
        "from.line length": ((_a = lines[payload.range.from.line]) == null ? void 0 : _a.length) || 0,
        "to.line length": ((_b = lines[payload.range.to.line]) == null ? void 0 : _b.length) || 0
      });
      activeView.editor.replaceRange(payload.text, payload.range.from, payload.range.to);
    }
    return {
      jsonrpc: "2.0",
      id,
      protocolVersion: PROTOCOL_VERSION,
      result: {
        activeFile: (_d = (_c = activeView == null ? void 0 : activeView.file) == null ? void 0 : _c.path) != null ? _d : null,
        cursor: activeView.editor.getCursor(),
        selection: activeView.editor.getSelection(),
        content: activeView.editor.getValue()
      }
    };
  }
  methodNotFound(id, method) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: "METHOD_NOT_FOUND",
        message: `Method ${method} not supported`,
        data: { correlationId: `corr-${Date.now()}` }
      }
    };
  }
  validationError(id, message) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: "VALIDATION",
        message,
        data: { correlationId: `corr-${Date.now()}` }
      }
    };
  }
  errorResponse(id, code, message) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message,
        data: { correlationId: `corr-${Date.now()}` }
      }
    };
  }
  handleError(id, error) {
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    return this.errorResponse(id, "INTERNAL", message);
  }
  /**
   * Update frontmatter in content. Preserves existing frontmatter structure.
   */
  updateFrontmatter(content, metadata) {
    return applyFrontmatter(content, metadata);
  }
};
var ObsidianCompanionPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, "settings", DEFAULT_SETTINGS);
    __publicField(this, "host", null);
    __publicField(this, "server", null);
    __publicField(this, "statusBarElement", null);
  }
  async onload() {
    console.debug("Companion MCP: plugin loading");
    await this.loadSettings();
    if (!this.isValidPort(this.settings.port)) {
      new import_obsidian.Notice("Invalid port in settings; using default.");
      this.settings.port = DEFAULT_SETTINGS.port;
      await this.saveSettings();
    }
    this.host = new LocalJsonRpcHost(this);
    this.addSettingTab(new CompanionSettingTab(this.app, this));
    this.statusBarElement = this.addStatusBarItem();
    this.updateStatusBar();
    this.app.workspace.onLayoutReady(() => {
      this.startServer();
    });
    console.debug(`Companion MCP: plugin loaded, will start server on port ${this.settings.port}`);
  }
  onunload() {
    this.stopServer();
    if (this.statusBarElement) {
      this.statusBarElement.remove();
      this.statusBarElement = null;
    }
    console.debug("Companion MCP: plugin unloaded");
  }
  async loadSettings() {
    const savedSettings = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...savedSettings };
  }
  async saveSettings() {
    if (!this.isValidPort(this.settings.port)) {
      new import_obsidian.Notice("Invalid port number.");
      return;
    }
    await this.saveData(this.settings);
    if (this.server) {
      this.restartServer();
    }
  }
  getServerStatus() {
    return this.server !== null;
  }
  updateStatusBar() {
    if (this.statusBarElement) {
      this.statusBarElement.setText(`Companion MCP: port ${this.settings.port}`);
    }
  }
  getVaultBasePath() {
    const adapter = this.app.vault.adapter;
    if (adapter instanceof import_obsidian.FileSystemAdapter) {
      return adapter.getBasePath();
    }
    return void 0;
  }
  startServer() {
    if (!this.settings.port || !this.isValidPort(this.settings.port)) {
      new import_obsidian.Notice("Invalid port. Cannot start server.");
      return;
    }
    try {
      if (this.server) {
        this.server.close();
        this.server = null;
      }
      this.server = http.createServer((req, res) => {
        void this.handleRequest(req, res);
      });
      this.server.on("error", (error) => {
        this.handleServerError(error);
      });
      this.server.listen(this.settings.port, "127.0.0.1", () => {
        const msg = `Companion MCP: server active on port ${this.settings.port}`;
        console.debug(msg);
        new import_obsidian.Notice(msg);
      });
    } catch (error) {
      this.handleServerError(error);
    }
  }
  async handleRequest(req, res) {
    var _a;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (!this.isLocalRequest(req)) {
      const remoteAddress = req.socket.remoteAddress || "unknown";
      console.warn(`Companion MCP: Rejected connection from ${remoteAddress}`);
      res.writeHead(403);
      res.end("Forbidden: Localhost only");
      return;
    }
    if (req.method === "POST") {
      let body = "";
      try {
        for await (const chunk of req) {
          body += chunk.toString();
        }
        const request = JSON.parse(body);
        const response = await ((_a = this.host) == null ? void 0 : _a.handle(request));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      } catch (error) {
        console.error("Companion MCP: request handling error", error);
        res.writeHead(400);
        res.end("Invalid JSON-RPC request");
      }
    } else {
      res.writeHead(405);
      res.end("Method Not Allowed");
    }
  }
  handleServerError(error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Companion MCP: server error", error);
    new import_obsidian.Notice(`Companion MCP error: ${message}`);
  }
  stopServer() {
    if (this.server) {
      this.server.close(() => {
        console.debug("Companion MCP: server stopped");
      });
      this.server = null;
    }
  }
  restartServer() {
    this.stopServer();
    setTimeout(() => {
      this.startServer();
    }, 100);
  }
  isValidPort(port) {
    return Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT;
  }
  isLocalRequest(req) {
    const remoteAddress = req.socket.remoteAddress || "";
    const hostHeader = req.headers.host || "";
    return remoteAddress.includes("127.0.0.1") || remoteAddress.includes("::1") || remoteAddress.includes("localhost") || hostHeader.includes("127.0.0.1") || hostHeader.includes("localhost");
  }
};
var CompanionSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    __publicField(this, "plugin");
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Server").setHeading();
    new import_obsidian.Setting(containerEl).setName("Server port").setDesc(`The port for the local JSON-RPC server. Must be between ${MIN_PORT} and ${MAX_PORT}. Default: ${DEFAULT_SETTINGS.port}`).addText((text) => text.setPlaceholder(DEFAULT_SETTINGS.port.toString()).setValue(this.plugin.settings.port.toString()).onChange(async (value) => {
      const port = parseInt(value);
      if (!isNaN(port) && port >= MIN_PORT && port <= MAX_PORT) {
        this.plugin.settings.port = port;
        await this.plugin.saveSettings();
        this.plugin.updateStatusBar();
      }
    }));
    const isServerRunning = this.plugin.getServerStatus();
    new import_obsidian.Setting(containerEl).setName("Server status").setDesc(isServerRunning ? "Server is running" : "Server is stopped").addButton((button) => button.setButtonText("Restart server").onClick(() => {
      this.plugin.restartServer();
      new import_obsidian.Notice("Server restarted.");
    }));
    containerEl.createEl("p", {
      text: "Provides local JSON-RPC access for AI agents. Only localhost connections are allowed."
    });
  }
};
