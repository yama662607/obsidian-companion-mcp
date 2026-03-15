import fs from "node:fs";
import path from "node:path";

function walk(dirPath, collector = []) {
    if (!fs.existsSync(dirPath)) {
        return collector;
    }
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            walk(fullPath, collector);
        } else {
            collector.push(fullPath);
        }
    }
    return collector;
}

export function extractToolRegistrations(source) {
    const tools = [];
    const startRegex = /registerTool\s*\(\s*"([^"]+)"/g;

    for (const match of source.matchAll(startRegex)) {
        const name = match[1];
        const start = match.index ?? 0;
        const window = source.slice(start, start + 2500);
        const endIndex = window.indexOf("async ");
        const optionsBlock = endIndex >= 0 ? window.slice(0, endIndex) : window;
        tools.push({ name, optionsBlock });
    }
    return tools;
}

export function validateSchemaPolicy(fileSources) {
    const errors = [];
    const boundedLimitRegex = /limit\s*:\s*z\.number\(\)\.[\s\S]*?\.min\(\d+\)[\s\S]*?\.max\(\d+\)/m;

    for (const item of fileSources) {
        const tools = extractToolRegistrations(item.source);
        for (const tool of tools) {
            if (!/inputSchema\s*:\s*z\.object\s*\(/.test(tool.optionsBlock)) {
                errors.push(`${item.filePath}:${tool.name} must use z.object for inputSchema`);
            }
            if (/\blimit\s*:/.test(tool.optionsBlock) && !boundedLimitRegex.test(tool.optionsBlock)) {
                errors.push(`${item.filePath}:${tool.name} limit must be bounded with min/max`);
            }
            if (/z\.any\s*\(/.test(tool.optionsBlock)) {
                errors.push(`${item.filePath}:${tool.name} must not use z.any in inputSchema`);
            }
        }
    }

    return { ok: errors.length === 0, errors };
}

export function validateAnnotationPolicy(fileSources) {
    const errors = [];

    for (const item of fileSources) {
        const tools = extractToolRegistrations(item.source);
        for (const tool of tools) {
            const lowerName = tool.name.toLowerCase();
            const hasReadOnly = /readOnlyHint\s*:\s*true/.test(tool.optionsBlock);
            const hasDestructive = /destructiveHint\s*:\s*true/.test(tool.optionsBlock);
            const isReadTool = /^(get_|list_|search_|inspect_)/.test(lowerName) || /_context$/.test(lowerName);
            const isDestructive = /^(delete_|remove_|clear_)/.test(lowerName);

            if (isReadTool && !hasReadOnly) {
                errors.push(`${item.filePath}:${tool.name} read tool must set readOnlyHint: true`);
            }
            if (isDestructive && !hasDestructive) {
                errors.push(`${item.filePath}:${tool.name} destructive tool must set destructiveHint: true`);
            }
        }
    }

    return { ok: errors.length === 0, errors };
}

export function validateContractPayloads(payloads) {
    const errors = [];
    const handshake = payloads?.handshakeResponse;
    const errorResponse = payloads?.errorResponse;

    if (!handshake || handshake.jsonrpc !== "2.0" || !handshake.protocolVersion || !handshake.result) {
        errors.push("Handshake response must include jsonrpc=2.0, protocolVersion, and result");
    }
    if (!errorResponse || errorResponse.jsonrpc !== "2.0" || !errorResponse.error?.code || !errorResponse.error?.data?.correlationId) {
        errors.push("Error response must include jsonrpc=2.0, error.code, and error.data.correlationId");
    }

    return { ok: errors.length === 0, errors };
}

function collectToolFileSources(repoRoot) {
    const bridgeSrc = path.join(repoRoot, "bridge", "src");
    const files = walk(bridgeSrc).filter((filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx"));
    return files.map((filePath) => ({
        filePath: path.relative(repoRoot, filePath),
        source: fs.readFileSync(filePath, "utf8"),
    }));
}

function validateReleaseEvidence(repoRoot) {
    const evidencePath = path.join(repoRoot, "docs", "execution", "evidence", "just-check-latest.json");
    if (!fs.existsSync(evidencePath)) {
        return {
            ok: false,
            errors: ["Missing just-check evidence at docs/execution/evidence/just-check-latest.json"],
        };
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
        if (!parsed.status || parsed.status !== "pass") {
            return { ok: false, errors: ["just-check evidence status must be pass"] };
        }
        return { ok: true, errors: [] };
    } catch {
        return { ok: false, errors: ["just-check evidence JSON is invalid"] };
    }
}

function main() {
    const repoRoot = process.cwd();
    const fileSources = collectToolFileSources(repoRoot);
    const fixturePath = path.join(repoRoot, "scripts", "execution", "fixtures", "contract-payloads.json");
    const fixture = fs.existsSync(fixturePath)
        ? JSON.parse(fs.readFileSync(fixturePath, "utf8"))
        : {};

    const checks = [
        { name: "schema-policy", result: validateSchemaPolicy(fileSources) },
        { name: "annotation-policy", result: validateAnnotationPolicy(fileSources) },
        { name: "contract-payloads", result: validateContractPayloads(fixture) },
        { name: "release-evidence", result: validateReleaseEvidence(repoRoot) },
    ];

    let hasErrors = false;
    for (const check of checks) {
        if (!check.result.ok) {
            hasErrors = true;
            console.error(`[FAIL] ${check.name}`);
            for (const err of check.result.errors) {
                console.error(`  - ${err}`);
            }
        } else {
            console.error(`[PASS] ${check.name}`);
        }
    }

    if (hasErrors) {
        process.exitCode = 1;
        return;
    }
    console.error("All execution quality gates passed.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
