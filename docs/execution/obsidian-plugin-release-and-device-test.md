# Obsidian Plugin Release and Device Test

This runbook prepares the plugin for release and validates installation on a local Obsidian vault before publication.

## 1. Prepare release artifacts

Run from repository root:

```bash
just plugin-release-prepare
```

Expected output directory:

- dist/plugin-release/main.js
- dist/plugin-release/manifest.json
- dist/plugin-release/versions.json
- dist/plugin-release/styles.css (only if present)

## 2. Real-device pre-release test (local vault install)

Install the plugin into your target vault:

```bash
just plugin-install-local /absolute/path/to/YourVault
```

Then open Obsidian and verify:

1. Settings -> Community plugins.
2. Enable Community plugins if disabled.
3. Confirm plugin "obsidian-companion-mcp" appears in installed list and can be enabled.
4. Enable plugin and restart Obsidian.
5. Validate expected behavior:
   - Plugin loads without startup errors.
   - Editor context features are available.
   - Bridge can connect locally.

## 3. Publish readiness checks

Before creating GitHub Release:

- Confirm `plugin/manifest.json` version is in x.y.z format.
- Confirm GitHub release tag exactly matches `plugin/manifest.json` version.
- Upload release assets: main.js, manifest.json, styles.css (if present).
- Keep manifest.json in repository root of the plugin release repository.

## 4. App in-store distribution (Obsidian Community Plugins)

After initial release assets are published, submit to Obsidian community list:

- Add plugin entry to obsidianmd/obsidian-releases community-plugins.json.
- Wait for bot validation and review.
- Address comments by updating the same PR and release assets.
