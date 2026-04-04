#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-$(pwd)}"
SAMPLE_DIR="$ROOT_DIR/samples/mcp-squad-memory"
MCP_DIR="$ROOT_DIR/.squad"
MCP_SNIPPET="$MCP_DIR/mcp.squad-memory.json"

if [[ ! -d "$SAMPLE_DIR" ]]; then
  echo "❌ Sample directory not found: $SAMPLE_DIR" >&2
  exit 1
fi

mkdir -p "$MCP_DIR"

pushd "$SAMPLE_DIR" >/dev/null
npm install
popd >/dev/null

cat > "$MCP_SNIPPET" <<JSON
{
  "mcpServers": {
    "squad-memory": {
      "command": "node",
      "args": [
        "$SAMPLE_DIR/node_modules/tsx/dist/cli.mjs",
        "$SAMPLE_DIR/src/index.ts"
      ],
      "env": {
        "SQUAD_MEMORY_BACKEND": "sqlite",
        "SQUAD_MEMORY_DB": ".squad/squad-memory.db"
      }
    }
  }
}
JSON

echo "✅ Installed sample dependencies."
echo "✅ Wrote MCP config snippet: $MCP_SNIPPET"
echo
echo "Next step: merge this snippet into your active MCP config (for example .mcp.json)."
echo "Then restart your MCP client to load the squad-memory server."
