import fs from "node:fs";
import path from "node:path";

export function discoverVaultConfigDir(vaultPath: string): string | null {
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

export function resolvePluginStoragePath(vaultPath: string, configDir: string | null | undefined, ...segments: string[]): string {
    const normalizedConfigDir = configDir?.trim();
    const pluginRoot = normalizedConfigDir
        ? path.join(vaultPath, normalizedConfigDir, "plugins", "companion-mcp")
        : path.join(vaultPath, "plugins", "companion-mcp");
    return path.join(pluginRoot, ...segments);
}
