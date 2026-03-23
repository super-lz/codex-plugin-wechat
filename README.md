# Codex WeChat Gateway

[中文说明](./README.zh-CN.md)

WeChat bridge for local Codex App Server sessions.

## Overview

- sends WeChat messages to Codex
- sends Codex replies back to WeChat
- supports pairing and allowlist access control
- gives each approved user an isolated workspace
- supports image and file transfer in both directions

## Quick Start

```bash
cd /path/to/codex-plugin-wechat
npm install
npm run smoke
npm run login
npm run wechat
```

When the bot sends you a pairing code, approve it with:

```bash
npm run access -- pair <code>
```

## Paths

This project uses two root directories by default:

- `gateway home`: `$HOME/codex-plugin-wechat`
- `worker root`: `$HOME/codex-plugin-wechat-worker`

Default layout:

```text
$HOME/codex-plugin-wechat/
  config/config.json
  logs/
  sessions/
  wechat/

$HOME/codex-plugin-wechat-worker/
  users/<user-workspace>/
```

Inbound files are stored under:

```text
<user-workspace>/inbound/
```

## Configuration

Config file:

```bash
$HOME/codex-plugin-wechat/config/config.json
```

Example:

```json
{
  "codexBin": "/path/to/codex",
  "workRoot": "$HOME/codex-plugin-wechat-worker",
  "codexApprovalPolicy": "never",
  "codexSandboxMode": "workspace-write"
}
```

Optional overrides:

```bash
export CODEX_BIN=/absolute/path/to/codex
export CODEX_PLUGIN_WECHAT_HOME=/absolute/path/to/codex-plugin-wechat
export WECHAT_CODEX_WORKROOT=/absolute/path/to/codex-plugin-wechat-worker
export CODEX_APPROVAL_POLICY=never
export CODEX_SANDBOX_MODE=workspace-write
```

## File Transfer

To send a local file or image back to WeChat, Codex must include a `codex-actions` block:

````text
```codex-actions
{
  "send": [
    { "type": "image", "path": "/absolute/path/out.png" },
    { "type": "file", "path": "/absolute/path/report.pdf" }
  ]
}
```
````

Rules:

- only absolute local paths are accepted
- `image` is for inline viewing in WeChat
- `file` is for attachments
- WeChat may transcode `image`; use `file` if format preservation matters

## Common Commands

```bash
npm run smoke
npm run login
npm run wechat
npm run access -- status
npm run access -- pair <code>
npm run reset -- state
npm run reset -- all
```

`reset -- state` clears saved gateway state. `reset -- all` also removes user workspaces.

## Development

```bash
npm run test
npm run check
npm run build
```

See [CONTRIBUTING.md](./CONTRIBUTING.md).
