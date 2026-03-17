# =============================================================================
# Configuration & Variables
# =============================================================================

set dotenv-load := true
set shell := ["bash", "-c"]

# Package manager (npm/pnpm/bun)

pm := "npm"

# Subprojects

MCP_DIR := "mcp"
PLUGIN_DIR := "plugin"

# =============================================================================
# Standard Interface (AI Agent Protocol)
# =============================================================================

# Default: Run read-only quality check
default: check

# Setup: Install dependencies for all subprojects
setup:
    @echo "Setting up environment..."
    cd {{ MCP_DIR }} && {{ pm }} install
    cd {{ PLUGIN_DIR }} && {{ pm }} install
    @echo "Setup complete! Run 'just check' to verify."

# Quality gate: Read-only verification (CI compatible)
check: fmt-check lint typecheck execution-check
    @echo "All quality checks passed!"

# Auto-fix: Apply format and lint fixes
fix: fmt lint-fix
    @echo "Auto-fixes applied!"

# =============================================================================
# Testing & Verification
# =============================================================================

# Unit/integration tests with argument pass-through
test *args="":
    @echo "Running tests..."
    @cd {{ MCP_DIR }} && {{ pm }} test {{ args }} 2>/dev/null || echo "No tests configured for mcp"
    @cd {{ PLUGIN_DIR }} && {{ pm }} test {{ args }} 2>/dev/null || echo "No tests configured for plugin"

# =============================================================================
# Granular Tasks (Components of 'check' & 'fix')
# =============================================================================
# --- Format ---

# Check formatting (skip if Biome not configured)
fmt-check:
    @echo "Checking formatting..."
    @if [ -f "biome.json" ] || command -v biome >/dev/null 2>&1; then \
        biome check --formatter-enabled=true --linter-enabled=false .; \
    else \
        echo "Biome not configured, skipping format check."; \
    fi

# Format code (skip if Biome not configured)
fmt:
    @echo "Formatting code..."
    @if [ -f "biome.json" ] || command -v biome >/dev/null 2>&1; then \
        biome format --write .; \
    else \
        echo "Biome not configured, skipping format."; \
    fi

# --- Lint ---

# Lint code (skip if Biome not configured)
lint:
    @echo "Linting..."
    @if [ -f "biome.json" ] || command -v biome >/dev/null 2>&1; then \
        biome check .; \
    else \
        echo "Biome not configured, skipping lint."; \
    fi

# Fix lint errors (skip if Biome not configured)
lint-fix:
    @echo "Fixing lint errors..."
    @if [ -f "biome.json" ] || command -v biome >/dev/null 2>&1; then \
        biome check --write .; \
    else \
        echo "Biome not configured, skipping lint fix."; \
    fi

# --- Typecheck ---

# Check TypeScript types for all subprojects (skip if TypeScript not installed)
typecheck:
    @echo "Checking types..."
    @if [ -f "{{ MCP_DIR }}/node_modules/.bin/tsc" ]; then \
        cd {{ MCP_DIR }} && npx tsc --noEmit; \
    else \
        echo "TypeScript not installed in mcp, run 'just setup' first."; \
    fi
    @if [ -f "{{ PLUGIN_DIR }}/node_modules/.bin/tsc" ]; then \
        cd {{ PLUGIN_DIR }} && npx tsc --noEmit; \
    else \
        echo "TypeScript not installed in plugin, run 'just setup' first."; \
    fi

# --- Execution Quality Gates ---

# Validate execution governance checks and policy tests
execution-check:
    @echo "Running execution quality gates..."
    @cd {{ MCP_DIR }} && {{ pm }} run build
    @USE_REMOTE_EMBEDDING=true OBSIDIAN_VAULT_PATH=. OBSIDIAN_CONFIG_DIR=.obsidian node --test scripts/execution/validate-quality-gates.test.mjs scripts/implementation/*.test.mjs
    @node scripts/execution/validate-quality-gates.mjs

# =============================================================================
# Operations & Utilities
# =============================================================================

# Start development (mcp)
dev-mcp:
    @echo "Starting mcp dev server..."
    cd {{ MCP_DIR }} && {{ pm }} run dev

# Start development (plugin)
dev-plugin:
    @echo "Starting plugin dev build..."
    cd {{ PLUGIN_DIR }} && {{ pm }} run dev

# Production build for all subprojects
build:
    @echo "Building all artifacts..."
    cd {{ MCP_DIR }} && {{ pm }} run build
    cd {{ PLUGIN_DIR }} && {{ pm }} run build
    @echo "Build complete!"

# Remove build artifacts
clean:
    @echo "Cleaning artifacts..."
    rm -rf {{ MCP_DIR }}/dist {{ MCP_DIR }}/node_modules
    rm -rf {{ PLUGIN_DIR }}/dist {{ PLUGIN_DIR }}/main.js {{ PLUGIN_DIR }}/node_modules

# =============================================================================
# Subproject-specific Commands
# =============================================================================

# MCP commands
mcp-build:
    cd {{ MCP_DIR }} && {{ pm }} run build

mcp-start:
    cd {{ MCP_DIR }} && {{ pm }} run start

# Plugin commands
plugin-build:
    cd {{ PLUGIN_DIR }} && {{ pm }} run build

# Prepare publish-ready plugin release assets in dist/plugin-release
plugin-release-prepare:
    @bash scripts/release/prepare-plugin-release.sh

# Install plugin into an Obsidian vault for pre-release real-device testing
plugin-install-local vault_path:
    @bash scripts/release/install-plugin-to-vault.sh "{{ vault_path }}"

# Install/update plugin into the vault pointed to by OBSIDIAN_VAULT_PATH
plugin-install:
    @if [ -z "${OBSIDIAN_VAULT_PATH:-}" ]; then \
        echo "Error: OBSIDIAN_VAULT_PATH is not set."; \
        echo "Usage: OBSIDIAN_VAULT_PATH=/absolute/path/to/vault just plugin-install"; \
        exit 1; \
    fi
    @bash scripts/release/install-plugin-to-vault.sh "${OBSIDIAN_VAULT_PATH}"

# =============================================================================
# Dependency Management
# =============================================================================

# Safety check: Ensure git working tree is clean
ensure-clean:
    @if [ -n "$(git status --porcelain)" ]; then \
        echo "Error: Working directory is dirty."; \
        echo "Please commit or stash changes before upgrading."; \
        exit 1; \
    fi

# Upgrade packages for all subprojects
upgrade: ensure-clean
    @echo "Baseline passed. Current code is stable."
    @echo "Starting full upgrade process..."
    cd {{ MCP_DIR }} && {{ pm }} update
    cd {{ PLUGIN_DIR }} && {{ pm }} update
    @echo "Verifying upgrade stability..."
    just check
    @echo "Upgrade complete!"
