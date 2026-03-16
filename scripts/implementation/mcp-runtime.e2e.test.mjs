import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function inheritedEnv() {
    return Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === "string"));
}

async function createMcpClient() {
    const sdkRoot = path.join(repoRoot, "bridge", "node_modules", "@modelcontextprotocol", "sdk", "dist", "esm");
    const { Client } = await import(pathToFileURL(path.join(sdkRoot, "client", "index.js")).href);
    const { StdioClientTransport } = await import(pathToFileURL(path.join(sdkRoot, "client", "stdio.js")).href);

    const transport = new StdioClientTransport({
        command: "node",
        args: [path.join(repoRoot, "bridge", "dist", "index.js")],
        cwd: repoRoot,
        env: {
            ...inheritedEnv(),
            OBSIDIAN_COMPANION_API_KEY: "local-dev-key",
        },
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

test("mcp e2e: refactored tool surface is discoverable", async (t) => {
    const session = await createMcpClient();
    t.after(async () => {
        await session.close();
    });

    const listed = await session.client.listTools();
    const names = listed.tools.map((tool) => tool.name);

    assert.ok(names.includes("search_notes_semantic"));
    assert.ok(names.includes("create_note"));
    assert.ok(names.includes("get_note"));
    assert.ok(names.includes("update_note_content"));
    assert.ok(names.includes("delete_note"));
    assert.ok(names.includes("update_note_metadata"));
    assert.ok(!names.includes("manage_note"));
    assert.ok(!names.includes("manage_metadata"));
});

test("mcp e2e: note, metadata, and semantic flow behaves consistently", async (t) => {
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
    assert.ok(readBack.structuredContent.content.includes("title: \"Runtime Refactor\""));

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

    const deleted = await session.client.callTool({
        name: "delete_note",
        arguments: { path: pathArg },
    });
    assert.ok(!deleted.isError);
    assert.equal(deleted.structuredContent.deleted, true);
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
