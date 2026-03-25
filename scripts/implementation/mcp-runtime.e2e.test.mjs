import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const e2eVaultRoot = path.join(repoRoot, ".tmp", "mcp-e2e-vault");
const semanticIndexPath = path.join(
  e2eVaultRoot,
  ".obsidian",
  "plugins",
  "companion-mcp",
  "data",
  "semantic-index.json",
);
const CURRENT_PROTOCOL_VERSION = "1.0.0";

function resetE2EVault() {
  fs.rmSync(e2eVaultRoot, { recursive: true, force: true });
  fs.mkdirSync(e2eVaultRoot, { recursive: true });
}

function writeLegacyVectorIndex(entries) {
  fs.mkdirSync(path.dirname(semanticIndexPath), { recursive: true });
  fs.writeFileSync(semanticIndexPath, JSON.stringify(entries), "utf8");
}

function inheritedEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => typeof value === "string"),
  );
}

async function createMcpClient(options = {}) {
  const { envOverrides = {}, includeDefaultVaultPath = true, unsetEnvKeys = [] } = options;
  const sdkRoot = path.join(
    repoRoot,
    "mcp",
    "node_modules",
    "@modelcontextprotocol",
    "sdk",
    "dist",
    "esm",
  );
  const { Client } = await import(pathToFileURL(path.join(sdkRoot, "client", "index.js")).href);
  const { StdioClientTransport } = await import(
    pathToFileURL(path.join(sdkRoot, "client", "stdio.js")).href
  );

  const inherited = inheritedEnv();
  for (const key of unsetEnvKeys) {
    delete inherited[key];
  }

  const env = {
    ...inherited,
    OBSIDIAN_COMPANION_API_KEY: "local-dev-key",
    OBSIDIAN_PLUGIN_PORT: "1",
    ...envOverrides,
  };
  if (includeDefaultVaultPath) {
    env.OBSIDIAN_VAULT_PATH = e2eVaultRoot;
  }

  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(repoRoot, "mcp", "dist", "index.js")],
    cwd: repoRoot,
    env,
    stderr: "pipe",
  });

  const client = new Client({
    name: "runtime-e2e-client",
    version: "1.0.0",
  });

  await client.connect(transport);

  return {
    client,
    transport,
    async close() {
      if (typeof client.close === "function") {
        await client.close();
      }
      await transport.close();
    },
  };
}

function positionToOffset(content, position) {
  const lines = content.split("\n");
  let offset = 0;
  for (let index = 0; index < position.line; index += 1) {
    offset += (lines[index]?.length ?? 0) + 1;
  }
  return offset + position.ch;
}

function replaceRange(content, range, text) {
  const start = positionToOffset(content, range.from);
  const end = positionToOffset(content, range.to);
  return `${content.slice(0, start)}${text}${content.slice(end)}`;
}

async function startMockPluginServer(responseFactory) {
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) {
      body += chunk.toString();
    }

    const request = JSON.parse(body);
    const response = responseFactory(request);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve(undefined);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, "127.0.0.1");
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine mock plugin server port");
  }

  return {
    port: address.port,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(undefined);
        });
      });
    },
  };
}

test("mcp e2e: final tool surface is discoverable", async (t) => {
  const session = await createMcpClient();
  t.after(async () => {
    await session.close();
  });

  const listed = await session.client.listTools();
  const names = listed.tools.map((tool) => tool.name);
  const toolByName = new Map(listed.tools.map((tool) => [tool.name, tool]));

  assert.ok(names.includes("list_notes"));
  assert.ok(names.includes("search_notes"));
  assert.ok(names.includes("semantic_search_notes"));
  assert.ok(names.includes("read_note"));
  assert.ok(names.includes("read_active_context"));
  assert.ok(names.includes("edit_note"));
  assert.ok(names.includes("create_note"));
  assert.ok(names.includes("patch_note_metadata"));
  assert.ok(names.includes("move_note"));
  assert.ok(names.includes("delete_note"));
  assert.ok(names.includes("get_semantic_index_status"));
  assert.ok(names.includes("refresh_semantic_index"));
  assert.ok(!names.includes("get_note"));
  assert.ok(!names.includes("update_note_content"));
  assert.ok(!names.includes("get_active_context"));
  assert.ok(!names.includes("replace_range"));

  assert.equal(toolByName.get("read_note")?.annotations?.readOnlyHint, true);
  assert.equal(toolByName.get("read_active_context")?.annotations?.readOnlyHint, true);
  assert.equal(toolByName.get("search_notes")?.annotations?.readOnlyHint, true);
  assert.equal(toolByName.get("semantic_search_notes")?.annotations?.readOnlyHint, true);
  assert.equal(toolByName.get("delete_note")?.annotations?.destructiveHint, true);
  assert.ok(toolByName.get("search_notes")?.inputSchema?.properties?.query);
  assert.ok(toolByName.get("read_note")?.inputSchema?.properties?.note);
  assert.ok(toolByName.get("edit_note")?.inputSchema?.properties?.target);
});

test("mcp e2e: persisted discovery, read, edit, metadata, and lifecycle flow works", async (t) => {
  resetE2EVault();
  const session = await createMcpClient({
    envOverrides: {
      USE_REMOTE_EMBEDDING: "true",
    },
  });
  t.after(async () => {
    await session.close();
  });

  const notePath = "e2e/runtime-refactor.md";

  const created = await session.client.callTool({
    name: "create_note",
    arguments: {
      path: notePath,
      content: [
        "# Runtime Refactor",
        "",
        "## Action Items",
        "- Update onboarding checklist",
        "- Add handoff notes",
        "",
        "semantic marker line",
      ].join("\n"),
    },
  });
  assert.ok(!created.isError);
  assert.equal(created.structuredContent.note.path, notePath);
  assert.match(created.content[0].text, /runtime-refactor\.md/);

  const patched = await session.client.callTool({
    name: "patch_note_metadata",
    arguments: {
      note: notePath,
      metadata: {
        tags: ["mcp", "e2e"],
        status: "active",
      },
    },
  });
  assert.ok(!patched.isError);
  assert.deepEqual(patched.structuredContent.metadata.tags, ["mcp", "e2e"]);
  assert.equal(patched.structuredContent.metadata.status, "active");

  const mergedPatch = await session.client.callTool({
    name: "patch_note_metadata",
    arguments: {
      note: notePath,
      metadata: {
        status: "completed",
      },
    },
  });
  assert.ok(!mergedPatch.isError);
  assert.deepEqual(mergedPatch.structuredContent.metadata.tags, ["mcp", "e2e"]);
  assert.equal(mergedPatch.structuredContent.metadata.status, "completed");

  const lexical = await session.client.callTool({
    name: "search_notes",
    arguments: {
      query: "handoff",
      limit: 5,
      include: {
        snippet: true,
        matchLocations: true,
        tags: true,
        frontmatterKeys: ["status"],
      },
    },
  });
  assert.ok(!lexical.isError);
  assert.equal(lexical.structuredContent.returned, 1);
  assert.equal(lexical.structuredContent.results[0].note.path, notePath);
  assert.ok(
    !lexical.structuredContent.results[0].snippet.text.includes("# Runtime Refactor\n\n##"),
  );
  assert.match(lexical.content[0].text, /runtime-refactor\.md/);
  assert.match(lexical.content[0].text, /readHint=/);

  const readHeading = await session.client.callTool({
    name: "read_note",
    arguments: {
      note: notePath,
      anchor: {
        type: "heading",
        headingPath: ["Action Items"],
      },
      maxChars: 500,
      include: {
        metadata: true,
        documentMap: true,
      },
    },
  });
  assert.ok(!readHeading.isError);
  assert.equal(readHeading.structuredContent.note.path, notePath);
  assert.equal(readHeading.structuredContent.editTarget.source, "note");
  assert.equal(readHeading.structuredContent.selection.anchor.type, "heading");
  assert.deepEqual(readHeading.structuredContent.metadata.tags, ["mcp", "e2e"]);
  assert.match(readHeading.content[0].text, /editTarget=/);

  const appended = await session.client.callTool({
    name: "edit_note",
    arguments: {
      target: readHeading.structuredContent.editTarget,
      change: {
        type: "append",
        content: "\n- Review runtime status",
      },
    },
  });
  assert.ok(!appended.isError);
  assert.equal(appended.structuredContent.status, "applied");

  const readDocument = await session.client.callTool({
    name: "read_note",
    arguments: {
      note: notePath,
      maxChars: 2000,
      include: {
        metadata: true,
        documentMap: false,
      },
    },
  });
  assert.ok(!readDocument.isError);
  assert.match(readDocument.structuredContent.content.text, /Review runtime status/);

  const replaced = await session.client.callTool({
    name: "edit_note",
    arguments: {
      target: readDocument.structuredContent.documentEditTarget,
      change: {
        type: "replaceText",
        find: "semantic marker line",
        replace: "semantic marker updated",
        occurrence: "first",
      },
    },
  });
  assert.ok(!replaced.isError);
  assert.equal(replaced.structuredContent.status, "applied");

  const refreshed = await session.client.callTool({
    name: "refresh_semantic_index",
    arguments: {},
  });
  assert.ok(!refreshed.isError);
  assert.ok(typeof refreshed.structuredContent.indexedChunkCount === "number");
  assert.equal(refreshed.structuredContent.pendingCount, 0);

  const semantic = await session.client.callTool({
    name: "semantic_search_notes",
    arguments: {
      query: "semantic marker updated",
      topK: 3,
      maxPerNote: 2,
      include: {
        tags: true,
        frontmatterKeys: ["status"],
        neighboringLines: 1,
      },
    },
  });
  assert.ok(!semantic.isError);
  assert.equal(semantic.structuredContent.returned >= 1, true);
  assert.equal(semantic.structuredContent.results[0].note.path, notePath);
  assert.ok(semantic.structuredContent.results[0].chunk.text.includes("semantic marker updated"));
  assert.ok(semantic.structuredContent.results[0].chunk.text.length <= 1_200);

  const status = await session.client.callTool({
    name: "get_semantic_index_status",
    arguments: {
      pendingSampleLimit: 5,
    },
  });
  assert.ok(!status.isError);
  assert.ok(typeof status.structuredContent.indexedNoteCount === "number");
  assert.ok(typeof status.structuredContent.indexedChunkCount === "number");
  assert.equal(status.structuredContent.pendingCount, 0);
  assert.equal(status.structuredContent.ready, true);

  const moved = await session.client.callTool({
    name: "move_note",
    arguments: {
      from: notePath,
      to: "e2e/archive/runtime-refactor.md",
    },
  });
  assert.ok(!moved.isError);
  assert.equal(moved.structuredContent.to, "e2e/archive/runtime-refactor.md");

  const deleted = await session.client.callTool({
    name: "delete_note",
    arguments: {
      note: "e2e/archive/runtime-refactor.md",
    },
  });
  assert.ok(!deleted.isError);
  assert.equal(deleted.structuredContent.deleted, true);
});

test("mcp e2e: semantic search bounds legacy payloads loaded from disk", async (t) => {
  resetE2EVault();
  fs.mkdirSync(path.join(e2eVaultRoot, "e2e"), { recursive: true });
  fs.writeFileSync(
    path.join(e2eVaultRoot, "e2e", "legacy.md"),
    [
      "# Legacy Semantic",
      "",
      "line zero",
      "line one",
      "line two",
      "line three",
      "TCP semantic marker",
      "line five",
      "line six",
      "line seven",
    ].join("\n"),
    "utf8",
  );
  writeLegacyVectorIndex([
    [
      "e2e/legacy.md:0-0",
      {
        path: "e2e/legacy.md",
        snippet: `${"Legacy semantic payload ".repeat(400)}\nTCP semantic marker`,
        updatedAt: Date.now(),
        embedding: [1, 0.5, 0.25],
      },
    ],
  ]);

  const session = await createMcpClient({
    envOverrides: {
      USE_REMOTE_EMBEDDING: "true",
    },
  });
  t.after(async () => {
    await session.close();
  });

  const semantic = await session.client.callTool({
    name: "semantic_search_notes",
    arguments: {
      query: "TCP",
      topK: 2,
      maxPerNote: 1,
      include: {
        tags: false,
        frontmatterKeys: [],
        neighboringLines: 0,
      },
    },
  });

  assert.ok(!semantic.isError);
  assert.equal(semantic.structuredContent.returned, 1);
  assert.ok(semantic.structuredContent.results[0].chunk.text.length <= 1_200);
  assert.ok(semantic.structuredContent.results[0].anchor.endLine >= 6);
  assert.notEqual(semantic.structuredContent.results[0].chunk.id, "e2e/legacy.md:0-0");
  assert.ok(semantic.content[0].text.length < 4_000);
});

test("mcp e2e: refresh skips unchanged notes after metadata-first reconciliation", async (t) => {
  resetE2EVault();
  const session = await createMcpClient({
    envOverrides: {
      USE_REMOTE_EMBEDDING: "true",
    },
  });
  t.after(async () => {
    await session.close();
  });

  const notePath = "e2e/refresh-skip.md";
  const created = await session.client.callTool({
    name: "create_note",
    arguments: {
      path: notePath,
      content: "# Refresh Skip\n\nunchanged payload\n",
    },
  });
  assert.ok(!created.isError);

  const firstRefresh = await session.client.callTool({
    name: "refresh_semantic_index",
    arguments: {},
  });
  assert.ok(!firstRefresh.isError);
  assert.equal(firstRefresh.structuredContent.scannedCount, 1);

  const secondRefresh = await session.client.callTool({
    name: "refresh_semantic_index",
    arguments: {},
  });
  assert.ok(!secondRefresh.isError);
  assert.equal(secondRefresh.structuredContent.scannedCount, 1);
  assert.equal(secondRefresh.structuredContent.skippedCount, 1);
  assert.equal(secondRefresh.structuredContent.queuedCount, 0);
  assert.equal(secondRefresh.structuredContent.flushedCount, 0);
  assert.equal(secondRefresh.structuredContent.removedCount, 0);
  assert.match(secondRefresh.content[0].text, /skipped=1/);
});

test("mcp e2e: refresh removes stale semantic entries for deleted notes", async (t) => {
  resetE2EVault();
  const session = await createMcpClient({
    envOverrides: {
      USE_REMOTE_EMBEDDING: "true",
    },
  });
  t.after(async () => {
    await session.close();
  });

  const notePath = "e2e/stale-delete.md";
  const created = await session.client.callTool({
    name: "create_note",
    arguments: {
      path: notePath,
      content: "# Stale Delete\n\nremove me\n",
    },
  });
  assert.ok(!created.isError);

  const firstRefresh = await session.client.callTool({
    name: "refresh_semantic_index",
    arguments: {},
  });
  assert.ok(!firstRefresh.isError);
  assert.equal(firstRefresh.structuredContent.indexedNoteCount, 1);

  fs.rmSync(path.join(e2eVaultRoot, "e2e", "stale-delete.md"));

  const secondRefresh = await session.client.callTool({
    name: "refresh_semantic_index",
    arguments: {},
  });
  assert.ok(!secondRefresh.isError);
  assert.equal(secondRefresh.structuredContent.removedCount, 1);
  assert.equal(secondRefresh.structuredContent.indexedNoteCount, 0);

  const status = await session.client.callTool({
    name: "get_semantic_index_status",
    arguments: {},
  });
  assert.ok(!status.isError);
  assert.equal(status.structuredContent.removedCount, 1);
  assert.equal(status.structuredContent.indexedNoteCount, 0);
});

test("mcp e2e: refresh reports changed-vs-skipped counts for larger vaults", async (t) => {
  resetE2EVault();
  const session = await createMcpClient({
    envOverrides: {
      USE_REMOTE_EMBEDDING: "true",
    },
  });
  t.after(async () => {
    await session.close();
  });

  for (let index = 0; index < 6; index += 1) {
    const created = await session.client.callTool({
      name: "create_note",
      arguments: {
        path: `e2e/large-${index}.md`,
        content: `# Large ${index}\n\npayload ${index}\n`,
      },
    });
    assert.ok(!created.isError);
  }

  const seeded = await session.client.callTool({
    name: "refresh_semantic_index",
    arguments: {},
  });
  assert.ok(!seeded.isError);
  assert.equal(seeded.structuredContent.scannedCount, 6);

  fs.writeFileSync(
    path.join(e2eVaultRoot, "e2e", "large-3.md"),
    "# Large 3\n\npayload 3 updated\n",
    "utf8",
  );

  const refreshed = await session.client.callTool({
    name: "refresh_semantic_index",
    arguments: {},
  });
  assert.ok(!refreshed.isError);
  assert.equal(refreshed.structuredContent.scannedCount, 6);
  assert.equal(refreshed.structuredContent.skippedCount, 5);
  assert.equal(refreshed.structuredContent.queuedCount, 1);
  assert.equal(refreshed.structuredContent.flushedCount, 1);
  assert.equal(refreshed.structuredContent.removedCount, 0);
});

test("mcp e2e: read and edit tools accept JSON-string encoded nested arguments", async (t) => {
  resetE2EVault();
  const session = await createMcpClient();
  t.after(async () => {
    await session.close();
  });

  const notePath = "e2e/stringified-inputs.md";
  const created = await session.client.callTool({
    name: "create_note",
    arguments: {
      path: notePath,
      content: "# String Inputs\n\nHello world\n",
    },
  });
  assert.ok(!created.isError);

  const read = await session.client.callTool({
    name: "read_note",
    arguments: {
      note: notePath,
      anchor: JSON.stringify({ type: "full" }),
    },
  });
  assert.ok(!read.isError);
  assert.equal(read.structuredContent.editTarget.note, notePath);

  const edited = await session.client.callTool({
    name: "edit_note",
    arguments: {
      target: JSON.stringify(read.structuredContent.editTarget),
      change: JSON.stringify({
        type: "replaceText",
        find: "Hello",
        replace: "HELLO",
        occurrence: "first",
      }),
    },
  });
  assert.ok(!edited.isError);
  assert.equal(edited.structuredContent.status, "applied");
});

test("mcp e2e: active context read/edit handoff works against plugin bridge", async (t) => {
  resetE2EVault();
  let context = {
    activeFile: "e2e/active.md",
    cursor: { line: 0, ch: 10 },
    selection: "beta",
    selectionRange: {
      from: { line: 0, ch: 6 },
      to: { line: 0, ch: 10 },
    },
    content: "alpha beta gamma",
  };

  const plugin = await startMockPluginServer((request) => {
    if (request.method === "health.ping") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        protocolVersion: CURRENT_PROTOCOL_VERSION,
        result: {
          capabilities: [
            "health.ping",
            "editor.getContext",
            "editor.applyCommand",
            "notes.read",
            "notes.write",
            "notes.delete",
            "notes.move",
            "metadata.update",
          ],
          availability: "normal",
          configDir: ".obsidian",
          vaultPath: e2eVaultRoot,
        },
      };
    }

    if (request.method === "editor.getContext") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        protocolVersion: CURRENT_PROTOCOL_VERSION,
        result: context,
      };
    }

    if (request.method === "editor.applyCommand") {
      if (request.params.command === "replaceRange") {
        context = {
          ...context,
          content: replaceRange(context.content, request.params.range, request.params.text),
          selection: "",
          selectionRange: null,
        };
      }
      if (request.params.command === "insertText") {
        const range = { from: request.params.pos, to: request.params.pos };
        context = {
          ...context,
          content: replaceRange(context.content, range, request.params.text),
          selection: "",
          selectionRange: null,
        };
      }
      return {
        jsonrpc: "2.0",
        id: request.id,
        protocolVersion: CURRENT_PROTOCOL_VERSION,
        result: context,
      };
    }

    return {
      jsonrpc: "2.0",
      id: request.id,
      protocolVersion: CURRENT_PROTOCOL_VERSION,
      error: {
        code: "METHOD_NOT_FOUND",
        message: `Unsupported method: ${request.method}`,
        data: { correlationId: "mock-corr" },
      },
    };
  });

  const session = await createMcpClient({
    envOverrides: {
      OBSIDIAN_PLUGIN_PORT: String(plugin.port),
    },
  });
  t.after(async () => {
    await session.close();
    await plugin.close();
  });

  const active = await session.client.callTool({
    name: "read_active_context",
    arguments: {},
  });
  assert.ok(!active.isError);
  assert.equal(active.structuredContent.activeFile, "e2e/active.md");
  assert.equal(active.structuredContent.selection, "beta");
  assert.equal(active.structuredContent.contentTruncated, false);
  assert.ok(active.structuredContent.editTargets.selection);
  assert.match(active.content[0].text, /editTargets=/);

  const replacedSelection = await session.client.callTool({
    name: "edit_note",
    arguments: {
      target: active.structuredContent.editTargets.selection,
      change: {
        type: "replaceTarget",
        content: "BETA",
      },
    },
  });
  assert.ok(!replacedSelection.isError);
  assert.equal(replacedSelection.structuredContent.status, "applied");

  const refreshed = await session.client.callTool({
    name: "read_active_context",
    arguments: {},
  });
  assert.ok(!refreshed.isError);
  assert.equal(refreshed.structuredContent.content, "alpha BETA gamma");

  const inserted = await session.client.callTool({
    name: "edit_note",
    arguments: {
      target: refreshed.structuredContent.editTargets.cursor,
      change: {
        type: "replaceTarget",
        content: "!",
      },
    },
  });
  assert.ok(!inserted.isError);
  assert.equal(inserted.structuredContent.status, "applied");

  const insertAlias = await session.client.callTool({
    name: "edit_note",
    arguments: {
      target: refreshed.structuredContent.editTargets.cursor,
      change: {
        type: "insertAtCursor",
        content: "?",
      },
    },
  });
  assert.ok(!insertAlias.isError);
  assert.equal(insertAlias.structuredContent.status, "applied");
});

test("mcp e2e: read_active_context bounds large structured payloads", async (t) => {
  resetE2EVault();
  const repeatedLine = "0123456789 ".repeat(200);
  const context = {
    activeFile: "e2e/large-active.md",
    cursor: { line: 0, ch: 0 },
    selection: repeatedLine.repeat(3),
    selectionRange: {
      from: { line: 0, ch: 0 },
      to: { line: 0, ch: repeatedLine.repeat(3).length },
    },
    content: repeatedLine.repeat(30),
  };

  const plugin = await startMockPluginServer((request) => {
    if (request.method === "health.ping") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        protocolVersion: CURRENT_PROTOCOL_VERSION,
        result: {
          capabilities: ["health.ping", "editor.getContext"],
          availability: "normal",
          configDir: ".obsidian",
          vaultPath: e2eVaultRoot,
        },
      };
    }

    if (request.method === "editor.getContext") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        protocolVersion: CURRENT_PROTOCOL_VERSION,
        result: context,
      };
    }

    return {
      jsonrpc: "2.0",
      id: request.id,
      protocolVersion: CURRENT_PROTOCOL_VERSION,
      error: {
        code: "METHOD_NOT_FOUND",
        message: `Unsupported method: ${request.method}`,
        data: { correlationId: "mock-corr" },
      },
    };
  });

  const session = await createMcpClient({
    envOverrides: {
      OBSIDIAN_PLUGIN_PORT: String(plugin.port),
    },
  });
  t.after(async () => {
    await session.close();
    await plugin.close();
  });

  const active = await session.client.callTool({
    name: "read_active_context",
    arguments: {
      maxChars: 250,
    },
  });

  assert.ok(!active.isError);
  assert.equal(active.structuredContent.selectionTotalChars, context.selection.length);
  assert.equal(active.structuredContent.contentTotalChars, context.content.length);
  assert.equal(active.structuredContent.selectionTruncated, true);
  assert.equal(active.structuredContent.contentTruncated, true);
  assert.ok(active.structuredContent.selection.length <= 250);
  assert.ok(active.structuredContent.content.length <= 250);
  assert.equal(active.structuredContent.editTargets.selection.currentText, undefined);
  assert.equal(active.structuredContent.editTargets.document.currentText, undefined);
  assert.ok(active.content[0].text.length < 4_000);
});

test("mcp e2e: move fallback preserves the plugin failure reason when filesystem fallback succeeds", async (t) => {
  resetE2EVault();
  fs.mkdirSync(path.join(e2eVaultRoot, "e2e"), { recursive: true });
  fs.writeFileSync(path.join(e2eVaultRoot, "e2e", "fallback-move.md"), "# fallback move\n", "utf8");

  const plugin = await startMockPluginServer((request) => {
    if (request.method === "health.ping") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        protocolVersion: CURRENT_PROTOCOL_VERSION,
        result: {
          capabilities: ["health.ping", "notes.move"],
          availability: "normal",
          configDir: ".obsidian",
          vaultPath: e2eVaultRoot,
        },
      };
    }

    if (request.method === "notes.move") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        protocolVersion: CURRENT_PROTOCOL_VERSION,
        error: {
          code: "NOT_FOUND",
          message: `Note not found: ${request.params.from}`,
          data: { correlationId: "mock-move-not-found" },
        },
      };
    }

    return {
      jsonrpc: "2.0",
      id: request.id,
      protocolVersion: CURRENT_PROTOCOL_VERSION,
      error: {
        code: "METHOD_NOT_FOUND",
        message: `Unsupported method: ${request.method}`,
        data: { correlationId: "mock-corr" },
      },
    };
  });

  const session = await createMcpClient({
    envOverrides: {
      OBSIDIAN_PLUGIN_PORT: String(plugin.port),
    },
  });
  t.after(async () => {
    await session.close();
    await plugin.close();
  });

  const moved = await session.client.callTool({
    name: "move_note",
    arguments: {
      from: "e2e/fallback-move.md",
      to: "e2e/fallback-move-renamed.md",
    },
  });

  assert.ok(!moved.isError);
  assert.equal(moved.structuredContent.degraded, true);
  assert.equal(moved.structuredContent.degradedReason, "plugin_not_found_fallback_used");
});

test("mcp e2e: patch_note_metadata merges existing frontmatter and missing notes stay missing", async (t) => {
  resetE2EVault();
  const session = await createMcpClient();
  t.after(async () => {
    await session.close();
  });

  const notePath = "e2e/frontmatter-merge.md";
  const created = await session.client.callTool({
    name: "create_note",
    arguments: {
      path: notePath,
      content: ["---", "tags:", "  - one", "keep: true", "---", "", "# Merge Test"].join("\n"),
    },
  });
  assert.ok(!created.isError);

  const patched = await session.client.callTool({
    name: "patch_note_metadata",
    arguments: {
      note: notePath,
      metadata: { status: "done" },
    },
  });
  assert.ok(!patched.isError);
  assert.deepEqual(patched.structuredContent.metadata.tags, ["one"]);
  assert.equal(patched.structuredContent.metadata.keep, true);
  assert.equal(patched.structuredContent.metadata.status, "done");

  const read = await session.client.callTool({
    name: "read_note",
    arguments: {
      note: notePath,
      include: { metadata: true, documentMap: false },
    },
  });
  assert.ok(!read.isError);
  assert.deepEqual(read.structuredContent.metadata.frontmatter.tags, ["one"]);
  assert.equal(read.structuredContent.metadata.frontmatter.keep, true);
  assert.equal(read.structuredContent.metadata.frontmatter.status, "done");

  const missingPatch = await session.client.callTool({
    name: "patch_note_metadata",
    arguments: {
      note: "e2e/does-not-exist.md",
      metadata: { status: "missing" },
    },
  });
  assert.ok(missingPatch.isError);
  assert.equal(missingPatch.code, "NOT_FOUND");
});

test("mcp e2e: persisted note fallbacks preserve specific plugin failure reasons", async (t) => {
  resetE2EVault();
  fs.mkdirSync(path.join(e2eVaultRoot, "e2e"), { recursive: true });
  fs.writeFileSync(path.join(e2eVaultRoot, "e2e", "fallback-read.md"), "# fallback read\n", "utf8");

  const plugin = await startMockPluginServer((request) => {
    if (request.method === "health.ping") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        protocolVersion: CURRENT_PROTOCOL_VERSION,
        result: {
          capabilities: [
            "health.ping",
            "notes.read",
            "notes.write",
            "notes.delete",
            "metadata.update",
          ],
          availability: "normal",
          configDir: ".obsidian",
          vaultPath: e2eVaultRoot,
        },
      };
    }

    if (
      request.method === "notes.read" ||
      request.method === "notes.write" ||
      request.method === "notes.delete" ||
      request.method === "metadata.update"
    ) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        protocolVersion: CURRENT_PROTOCOL_VERSION,
        error: {
          code: "NOT_FOUND",
          message: `Mock plugin stale state for ${request.method}`,
          data: { correlationId: "mock-plugin-not-found" },
        },
      };
    }

    return {
      jsonrpc: "2.0",
      id: request.id,
      protocolVersion: CURRENT_PROTOCOL_VERSION,
      error: {
        code: "METHOD_NOT_FOUND",
        message: `Unsupported method: ${request.method}`,
        data: { correlationId: "mock-corr" },
      },
    };
  });

  const session = await createMcpClient({
    envOverrides: {
      OBSIDIAN_PLUGIN_PORT: String(plugin.port),
    },
  });
  t.after(async () => {
    await session.close();
    await plugin.close();
  });

  const created = await session.client.callTool({
    name: "create_note",
    arguments: {
      path: "e2e/fallback-write.md",
      content: "# fallback write\n",
    },
  });
  assert.ok(!created.isError);
  assert.equal(created.structuredContent.degradedReason, "plugin_not_found_fallback_used");

  const read = await session.client.callTool({
    name: "read_note",
    arguments: {
      note: "e2e/fallback-read.md",
    },
  });
  assert.ok(!read.isError);
  assert.equal(read.structuredContent.degradedReason, "plugin_not_found_fallback_used");

  const patched = await session.client.callTool({
    name: "patch_note_metadata",
    arguments: {
      note: "e2e/fallback-read.md",
      metadata: { status: "fallback" },
    },
  });
  assert.ok(!patched.isError);
  assert.equal(patched.structuredContent.degradedReason, "plugin_not_found_fallback_used");

  const deleted = await session.client.callTool({
    name: "delete_note",
    arguments: {
      note: "e2e/fallback-read.md",
    },
  });
  assert.ok(!deleted.isError);
  assert.equal(deleted.structuredContent.degradedReason, "plugin_not_found_fallback_used");
});
