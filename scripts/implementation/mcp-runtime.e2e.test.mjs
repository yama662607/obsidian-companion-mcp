import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const e2eVaultRoot = path.join(repoRoot, ".tmp", "mcp-e2e-vault");

function resetE2EVault() {
    fs.rmSync(e2eVaultRoot, { recursive: true, force: true });
    fs.mkdirSync(e2eVaultRoot, { recursive: true });
}

function inheritedEnv() {
    return Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === "string"));
}

async function createMcpClient(options = {}) {
    const { envOverrides = {}, includeDefaultVaultPath = true, unsetEnvKeys = [] } = options;
    const sdkRoot = path.join(repoRoot, "mcp", "node_modules", "@modelcontextprotocol", "sdk", "dist", "esm");
    const { Client } = await import(pathToFileURL(path.join(sdkRoot, "client", "index.js")).href);
    const { StdioClientTransport } = await import(pathToFileURL(path.join(sdkRoot, "client", "stdio.js")).href);

    const inherited = inheritedEnv();
    for (const key of unsetEnvKeys) {
        delete inherited[key];
    }

    const env = {
        ...inherited,
        OBSIDIAN_COMPANION_API_KEY: "local-dev-key",
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

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
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

test("mcp e2e: refactored tool surface is discoverable", async (t) => {
    const session = await createMcpClient();
    t.after(async () => {
        await session.close();
    });

    const listed = await session.client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    const toolByName = new Map(listed.tools.map((tool) => [tool.name, tool]));

    assert.ok(names.includes("search_notes_semantic"));
    assert.ok(names.includes("create_note"));
    assert.ok(names.includes("get_note"));
    assert.ok(names.includes("update_note_content"));
    assert.ok(names.includes("delete_note"));
    assert.ok(names.includes("update_note_metadata"));
    assert.ok(!names.includes("manage_note"));
    assert.ok(!names.includes("manage_metadata"));

    const deleteTool = toolByName.get("delete_note");
    assert.ok(deleteTool);
    assert.equal(deleteTool.annotations?.destructiveHint, true);

    const deleteInputProperties = deleteTool.inputSchema?.properties
        ? Object.keys(deleteTool.inputSchema.properties)
        : [];
    assert.deepEqual(deleteInputProperties, ["path"]);
    assert.deepEqual(deleteTool.inputSchema?.required, ["path"]);

    const getTool = toolByName.get("get_note");
    assert.ok(getTool);
    assert.equal(getTool.annotations?.readOnlyHint, true);

    const updateMetadataTool = toolByName.get("update_note_metadata");
    assert.ok(updateMetadataTool);
    assert.equal(updateMetadataTool.annotations?.idempotentHint, true);
});

test("mcp e2e: note, metadata, and semantic flow behaves consistently", async (t) => {
    resetE2EVault();
    const session = await createMcpClient();
    t.after(async () => {
        await session.close();
    });

    const pathArg = "e2e/runtime-refactor.md";

    const created = await session.client.callTool({
        name: "create_note",
        arguments: {
            path: pathArg,
            content: "# Runtime Refactor\n\nsemantic marker line",
        },
    });
    assert.ok(!created.isError);
    assert.ok(fs.existsSync(path.join(e2eVaultRoot, pathArg)));

    const updatedMetadata = await session.client.callTool({
        name: "update_note_metadata",
        arguments: {
            path: pathArg,
            metadata: {
                title: "Runtime Refactor",
                tags: ["mcp", "e2e"],
            },
        },
    });
    assert.ok(!updatedMetadata.isError);

    const readBack = await session.client.callTool({
        name: "get_note",
        arguments: { path: pathArg },
    });
    assert.ok(!readBack.isError);
    assert.equal(readBack.structuredContent.metadata.title, "Runtime Refactor");
    assert.ok(/title:\s*("Runtime Refactor"|Runtime Refactor)/.test(readBack.structuredContent.content));

    const searched = await session.client.callTool({
        name: "search_notes_semantic",
        arguments: {
            query: "semantic marker",
            limit: 5,
        },
    });
    assert.ok(!searched.isError);
    assert.ok(Array.isArray(searched.structuredContent.matches));
    assert.ok(typeof searched.structuredContent.indexStatus.pendingCount === "number");
    assert.ok(typeof searched.structuredContent.indexStatus.isEmpty === "boolean");
    assert.equal(searched.structuredContent.degraded, false);
    assert.equal(searched.structuredContent.degradedReason, null);
    assert.ok(searched.structuredContent.matches.some((match) => match.path === pathArg));

    const deleted = await session.client.callTool({
        name: "delete_note",
        arguments: { path: pathArg },
    });
    assert.ok(!deleted.isError);
    assert.equal(deleted.structuredContent.deleted, true);
});

test("mcp e2e: startup can discover vault path from plugin handshake", async (t) => {
    const discoveredVaultRoot = path.join(repoRoot, ".tmp", "mcp-e2e-auto-vault");
    fs.rmSync(discoveredVaultRoot, { recursive: true, force: true });
    fs.mkdirSync(discoveredVaultRoot, { recursive: true });

    const mockPlugin = await startMockPluginServer((request) => {
        if (request.method === "health.ping") {
            return {
                jsonrpc: "2.0",
                id: request.id,
                protocolVersion: request.protocolVersion,
                result: {
                    capabilities: ["health.ping"],
                    availability: "normal",
                    configDir: ".obsidian",
                    vaultPath: discoveredVaultRoot,
                },
            };
        }

        return {
            jsonrpc: "2.0",
            id: request.id,
            error: {
                code: "UNAVAILABLE",
                message: "mock plugin only supports health.ping",
                data: { correlationId: "corr-mock-plugin" },
            },
        };
    });

    const session = await createMcpClient({
        includeDefaultVaultPath: false,
        unsetEnvKeys: ["OBSIDIAN_VAULT_PATH", "OBSIDIAN_CONFIG_DIR"],
        envOverrides: {
            OBSIDIAN_PLUGIN_PORT: String(mockPlugin.port),
        },
    });

    t.after(async () => {
        await session.close();
        await mockPlugin.close();
    });

    const listed = await session.client.listTools();
    assert.ok(listed.tools.length > 0);

    const created = await session.client.callTool({
        name: "create_note",
        arguments: {
            path: "auto/discovered.md",
            content: "# Auto Configured Vault",
        },
    });

    assert.ok(!created.isError);
    assert.equal(
        fs.existsSync(path.join(discoveredVaultRoot, "auto", "discovered.md")),
        true,
    );
});

test("mcp e2e: delete_note returns success when plugin already removed the file", async (t) => {
    const discoveredVaultRoot = path.join(repoRoot, ".tmp", "mcp-e2e-delete-via-plugin");
    const notePath = "1_Inbox/plugin-delete.md";
    const absoluteNotePath = path.join(discoveredVaultRoot, notePath);

    fs.rmSync(discoveredVaultRoot, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(absoluteNotePath), { recursive: true });
    fs.writeFileSync(absoluteNotePath, "# plugin delete test\n", "utf8");

    const mockPlugin = await startMockPluginServer((request) => {
        if (request.method === "health.ping") {
            return {
                jsonrpc: "2.0",
                id: request.id,
                protocolVersion: request.protocolVersion,
                result: {
                    capabilities: ["health.ping", "notes.delete"],
                    availability: "normal",
                    configDir: ".obsidian",
                    vaultPath: discoveredVaultRoot,
                },
            };
        }

        if (request.method === "notes.delete") {
            fs.rmSync(absoluteNotePath, { force: true });
            return {
                jsonrpc: "2.0",
                id: request.id,
                protocolVersion: request.protocolVersion,
                result: { success: true },
            };
        }

        return {
            jsonrpc: "2.0",
            id: request.id,
            error: {
                code: "UNAVAILABLE",
                message: "mock plugin only supports health.ping and notes.delete",
                data: { correlationId: "corr-mock-plugin-delete" },
            },
        };
    });

    const session = await createMcpClient({
        includeDefaultVaultPath: false,
        unsetEnvKeys: ["OBSIDIAN_VAULT_PATH", "OBSIDIAN_CONFIG_DIR"],
        envOverrides: {
            OBSIDIAN_PLUGIN_PORT: String(mockPlugin.port),
        },
    });

    t.after(async () => {
        await session.close();
        await mockPlugin.close();
    });

    const deleted = await session.client.callTool({
        name: "delete_note",
        arguments: { path: notePath },
    });

    assert.ok(!deleted.isError);
    assert.equal(deleted.structuredContent.deleted, true);
    assert.equal(deleted.structuredContent.degraded, false);
    assert.equal(fs.existsSync(absoluteNotePath), false);
});

test("mcp e2e: runtime status resource is readable", async (t) => {
    const session = await createMcpClient();
    t.after(async () => {
        await session.close();
    });

    const runtime = await session.client.readResource({
        uri: "runtime://status",
    });

    assert.ok(runtime.contents.length > 0);
    const payload = JSON.parse(runtime.contents[0].text);
    assert.ok(["normal", "degraded", "unavailable"].includes(payload.availability));
    assert.ok(Object.hasOwn(payload, "retryCount"));
});

test("mcp e2e: review checklist resource and agent review prompt are available", async (t) => {
    const session = await createMcpClient();
    t.after(async () => {
        await session.close();
    });

    const resources = await session.client.listResources();
    const resourceUris = resources.resources.map((resource) => resource.uri);
    assert.ok(resourceUris.includes("review://checklist"));

    const checklist = await session.client.readResource({
        uri: "review://checklist",
    });
    const checklistPayload = JSON.parse(checklist.contents[0].text);
    assert.ok(Array.isArray(checklistPayload.checklist));
    assert.ok(checklistPayload.checklist.length >= 4);

    const prompts = await session.client.listPrompts();
    const promptNames = prompts.prompts.map((prompt) => prompt.name);
    assert.ok(promptNames.includes("workflow_agent_runtime_review"));

    const loadedPrompt = await session.client.getPrompt({
        name: "workflow_agent_runtime_review",
        arguments: {
            scope: "mcp tool surface",
            severityThreshold: "medium",
        },
    });
    assert.ok(loadedPrompt.messages.length > 0);
    assert.ok(loadedPrompt.messages[0].content.type === "text");
    assert.ok(loadedPrompt.messages[0].content.text.includes("Tool contract quality"));
});

test("mcp e2e: delete_note returns NOT_FOUND for missing note", async (t) => {
    const session = await createMcpClient();
    t.after(async () => {
        await session.close();
    });

    const result = await session.client.callTool({
        name: "delete_note",
        arguments: { path: "e2e/does-not-exist.md" },
    });

    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.code, "NOT_FOUND");
    assert.ok(typeof result.structuredContent.message === "string");
    const errorPayload = JSON.parse(result.content[0].text);
    assert.equal(errorPayload.isError, true);
    assert.equal(errorPayload.code, "NOT_FOUND");
});

test("mcp e2e: get_note returns structured NOT_FOUND error", async (t) => {
    const session = await createMcpClient();
    t.after(async () => {
        await session.close();
    });

    const result = await session.client.callTool({
        name: "get_note",
        arguments: { path: "e2e/missing-note.md" },
    });

    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.code, "NOT_FOUND");
    assert.ok(typeof result.structuredContent.message === "string");
    const errorPayload = JSON.parse(result.content[0].text);
    assert.equal(errorPayload.code, "NOT_FOUND");
    assert.equal(errorPayload.isError, true);
});

test("mcp e2e: insert_at_cursor returns structured validation error", async (t) => {
    const session = await createMcpClient();
    t.after(async () => {
        await session.close();
    });

    const result = await session.client.callTool({
        name: "insert_at_cursor",
        arguments: {
            text: "x",
            position: { line: 9999, ch: 9999 },
        },
    });

    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.code, "VALIDATION");
    assert.ok(typeof result.structuredContent.message === "string");
    const errorPayload = JSON.parse(result.content[0].text);
    assert.equal(errorPayload.code, "VALIDATION");
    assert.equal(errorPayload.isError, true);
});

test("mcp e2e: active context fields are semantically plausible", async (t) => {
    const session = await createMcpClient();
    t.after(async () => {
        await session.close();
    });

    const result = await session.client.callTool({
        name: "get_active_context",
        arguments: {},
    });

    assert.ok(!result.isError);
    assert.ok(typeof result.structuredContent.noActiveEditor === "boolean");
    assert.ok(typeof result.structuredContent.degraded === "boolean");
    assert.ok(typeof result.structuredContent.editorState === "string");
    assert.ok(typeof result.structuredContent.selection === "string");
    assert.ok(typeof result.structuredContent.content === "string");

    if (result.structuredContent.noActiveEditor === false) {
        const content = typeof result.structuredContent.content === "string"
            ? result.structuredContent.content
            : "";
        const cursor = result.structuredContent.cursor;

        if (cursor) {
            const lineCount = content.length === 0 ? 1 : content.split("\n").length;
            assert.ok(cursor.line >= 0);
            assert.ok(cursor.ch >= 0);
            assert.ok(cursor.line < lineCount);
        }
        assert.equal(result.structuredContent.editorState, "active");
    } else {
        assert.equal(result.structuredContent.editorState, "none");
    }
});
