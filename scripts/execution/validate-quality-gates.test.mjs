import test from "node:test";
import assert from "node:assert/strict";

import {
    extractToolRegistrations,
    validateSchemaPolicy,
    validateAnnotationPolicy,
    validateContractPayloads,
} from "./validate-quality-gates.mjs";

test("extractToolRegistrations finds tool metadata blocks", () => {
    const source = `
server.registerTool(
  "semantic_search",
  {
    annotations: {
      readOnlyHint: true,
    },
    inputSchema: z.object({
      query: z.string(),
      limit: z.number().min(1).max(20).default(10),
    }),
  },
  async () => ({ content: [{ type: "text", text: "ok" }] })
);
`;

    const tools = extractToolRegistrations(source);
    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, "semantic_search");
    assert.match(tools[0].optionsBlock, /readOnlyHint: true/);
});

test("validateSchemaPolicy rejects non-z.object schema and missing bounded limit", () => {
    const badSource = `
server.registerTool("manage_note", {
  inputSchema: {
    payload: z.any(),
    limit: z.number(),
  },
});
`;

    const result = validateSchemaPolicy([
        { filePath: "tools/manageNote.ts", source: badSource },
    ]);

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("must use z.object or a named *InputSchema")));
    assert.ok(result.errors.some((e) => e.includes("limit must be bounded")));
});

test("validateAnnotationPolicy enforces readOnlyHint for read tools", () => {
    const badSource = `
server.registerTool("get_active_context", {
  inputSchema: z.object({}),
  annotations: {},
});
`;

    const result = validateAnnotationPolicy([
        { filePath: "tools/context.ts", source: badSource },
    ]);

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("readOnlyHint")));
});

test("validateContractPayloads accepts valid handshake and error envelope", () => {
    const result = validateContractPayloads({
        handshakeResponse: {
            id: "1",
            jsonrpc: "2.0",
            protocolVersion: "1.0.0",
            result: { capabilities: ["semantic.search"] },
        },
        errorResponse: {
            id: "2",
            jsonrpc: "2.0",
            error: {
                code: "UNAVAILABLE",
                message: "Plugin unreachable",
                data: { correlationId: "abc-123" },
            },
        },
    });

    assert.equal(result.ok, true);
    assert.equal(result.errors.length, 0);
});
