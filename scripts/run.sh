#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

GATEWAY_HOME="${CODEX_PLUGIN_WECHAT_HOME:-$HOME/.codex-plugin-wechat}"
ENV_FILE="$GATEWAY_HOME/config/env.sh"

if [[ -f "$ENV_FILE" ]]; then
  source "$ENV_FILE"
fi

if [[ ! -d node_modules ]]; then
  npm install
fi

exec npm run dev -- run
