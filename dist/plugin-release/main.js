"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ObsidianCompanionPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// ../shared/protocol.ts
var PROTOCOL_VERSION = "1.0.0";

// src/main.ts
var LocalJsonRpcHost = class {
  constructor() {
    __publicField(this, "context", {
      activeFile: null,
      cursor: { line: 0, ch: 0 },
      selection: "",
      content: ""
    });
  }
  async handle(request) {
    if (request.method === "health.ping") {
      const result = {
        capabilities: ["health.ping", "editor.getContext", "editor.applyCommand", "semantic.search", "notes.read"],
        availability: "normal"
      };
      return {
        jsonrpc: "2.0",
        id: request.id,
        protocolVersion: PROTOCOL_VERSION,
        result
      };
    }
    if (request.method === "editor.getContext") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        protocolVersion: PROTOCOL_VERSION,
        result: this.context
      };
    }
    if (request.method === "editor.applyCommand") {
      const payload = request.params;
      if (payload.command === "insertText") {
        if (payload.pos.line < 0 || payload.pos.ch < 0) {
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: "VALIDATION",
              message: "Invalid insert position",
              data: { correlationId: `corr-${Date.now()}` }
            }
          };
        }
        this.context = {
          ...this.context,
          content: `${this.context.content}${payload.text}`,
          cursor: payload.pos
        };
      }
      if (payload.command === "replaceRange") {
        const invalid = payload.range.from.line < 0 || payload.range.from.ch < 0 || payload.range.to.line < 0 || payload.range.to.ch < 0;
        if (invalid) {
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: "VALIDATION",
              message: "Invalid replace range",
              data: { correlationId: `corr-${Date.now()}` }
            }
          };
        }
        this.context = {
          ...this.context,
          content: payload.text,
          cursor: payload.range.to
        };
      }
      return {
        jsonrpc: "2.0",
        id: request.id,
        protocolVersion: PROTOCOL_VERSION,
        result: this.context
      };
    }
    return {
      jsonrpc: "2.0",
      id: request.id,
      protocolVersion: PROTOCOL_VERSION,
      result: {}
    };
  }
};
var ObsidianCompanionPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, "host", null);
  }
  async onload() {
    this.host = new LocalJsonRpcHost();
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
    }));
  }
  onunload() {
    this.host = null;
  }
  getHostForTesting() {
    return this.host;
  }
};
