# AGENTS

This file is a maintenance guide for humans and coding agents working on this repository.

## Project Goal

Codex WeChat Gateway connects WeChat messages to a local Codex App Server session.

Core responsibilities:

- receive WeChat messages
- route them into Codex threads
- send Codex replies back to WeChat
- support per-user workspaces
- support file and image transfer
- support host-side control actions such as workspace switching and thread reset

## High-Level Structure

- [src/index.ts](./src/index.ts)
  CLI entrypoint. Keep this file thin.
- [src/commands/](./src/commands)
  Terminal-facing commands such as `login`, `access`, `reset`, `smoke`.
- [src/bridge/service.ts](./src/bridge/service.ts)
  Main gateway loop for inbound WeChat messages and outbound replies.
- [src/bridge/control.ts](./src/bridge/control.ts)
  Host-side control behavior and slash-command fallback.
- [src/codex/](./src/codex)
  Codex App Server client, protocol types, and developer instructions.
- [src/gateway/](./src/gateway)
  Sender-to-thread mapping, workspace mapping, and workspace path helpers.
- [src/wechat/](./src/wechat)
  WeChat auth, polling, API calls, media transfer, access control.
- [src/protocol/actions.ts](./src/protocol/actions.ts)
  Structured `codex-actions` parser for outbound send actions and host control actions.

## Runtime Model

The runtime has three major layers:

1. WeChat adapter
2. Gateway host
3. Codex App Server client

The gateway host is the middle layer. It owns:

- user access control
- sender-to-thread mapping
- sender-to-workspace mapping
- media download and upload
- execution of host control actions

## Default Paths

- gateway home: `$HOME/.codex-plugin-wechat`
- worker root: `$HOME/codex-plugin-wechat-worker`

Gateway home contains:

- `config/`
- `cache/`
- `logs/`
- `sessions/`
- `wechat/`

Worker root contains per-user workspaces:

- `users/<user-workspace>/`

Inbound media is stored under:

- `cache/users/<user>/inbound/`

## Configuration

Primary config file:

- `$HOME/.codex-plugin-wechat/config/config.json`

Persistent env file:

- `$HOME/.codex-plugin-wechat/config/env.sh`

The launcher script loads `env.sh` automatically.

Prefer:

- `config.json` for stable project settings
- `env.sh` only when a setting must be an environment variable

## codex-actions Contract

Codex can ask the gateway to perform structured actions by emitting a final `codex-actions` block.

Currently supported action groups:

- `send`
  - `image`
  - `file`
- `control`
  - `workspace.set`
  - `workspace.reset`
  - `thread.reset`

The parser lives in:

- [src/protocol/actions.ts](./src/protocol/actions.ts)

Host-side execution lives in:

- [src/bridge/control.ts](./src/bridge/control.ts)

## Where To Change Things

If you need to change...

- WeChat login or polling:
  - [src/wechat/auth.ts](./src/wechat/auth.ts)
  - [src/wechat/polling.ts](./src/wechat/polling.ts)
- WeChat send/download behavior:
  - [src/wechat/api.ts](./src/wechat/api.ts)
  - [src/wechat/media.ts](./src/wechat/media.ts)
  - [src/wechat/inbound-media.ts](./src/wechat/inbound-media.ts)
- Codex session behavior:
  - [src/codex/app-server-client.ts](./src/codex/app-server-client.ts)
- Built-in host control behavior:
  - [src/bridge/control.ts](./src/bridge/control.ts)
- Per-user workspace or thread state:
  - [src/gateway/session-manager.ts](./src/gateway/session-manager.ts)
  - [src/gateway/workspace.ts](./src/gateway/workspace.ts)
- Prompting / agent guidance:
  - [src/codex/bridge-instructions.ts](./src/codex/bridge-instructions.ts)
  - [src/codex/project-instructions.ts](./src/codex/project-instructions.ts)

## Adding A New Host Control Action

When adding a new action such as `gateway.restart` or `workspace.list`, update all of:

1. [src/protocol/actions.ts](./src/protocol/actions.ts)
2. [src/bridge/control.ts](./src/bridge/control.ts)
3. [src/codex/bridge-instructions.ts](./src/codex/bridge-instructions.ts)
4. [src/codex/project-instructions.ts](./src/codex/project-instructions.ts)
5. `test/**/*.test.ts`

Use `codex-actions` for natural-language-triggered host actions.
Keep slash commands only as explicit fallback.

## Change Discipline

Before finishing a change, run:

```bash
npm run test
npm run check
npm run build
```

Keep these boundaries intact:

- do not put persistent business logic back into `src/index.ts`
- do not mix WeChat API concerns into Codex client code
- do not put path-building logic all over the codebase; prefer `src/paths.ts`
- do not silently expand the `codex-actions` contract without tests and instruction updates

## Security Notes

- Never commit runtime credentials, logs, or local state.
- The repo should not contain files from gateway home.
- Keep examples generic and machine-independent.
