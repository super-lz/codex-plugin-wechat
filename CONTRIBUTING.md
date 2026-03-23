# Contributing

For architecture and maintenance context, see [AGENTS.md](./AGENTS.md).

## Local Setup

```bash
cd /path/to/codex-plugin-wechat
npm install
npm run test
npm run check
```

If `codex` is not on your `PATH`, set:

```bash
export CODEX_BIN=/absolute/path/to/codex
```

## Runtime Paths

By default:

- gateway home: `$HOME/.codex-plugin-wechat`
- worker root: `$HOME/codex-plugin-wechat-worker`

Overrides:

```bash
export CODEX_PLUGIN_WECHAT_HOME=/absolute/path/to/.codex-plugin-wechat
export WECHAT_CODEX_WORKROOT=/absolute/path/to/codex-plugin-wechat-worker
```

## Useful Commands

```bash
npm run smoke
npm run login
npm run wechat
npm run access -- status
```

## Adding A Control Action

To add a new host-side control action such as `workspace.list` or `gateway.restart`, update these places:

1. [src/protocol/actions.ts](./src/protocol/actions.ts)
   Add the action type and parse it from the `codex-actions` block.
2. [src/bridge/control.ts](./src/bridge/control.ts)
   Implement the host-side behavior and any slash-command fallback.
3. [src/codex/bridge-instructions.ts](./src/codex/bridge-instructions.ts)
   Tell Codex when and how to emit the new action.
4. [src/codex/project-instructions.ts](./src/codex/project-instructions.ts)
   Document project-specific behavior if the new action affects configuration or workflow.
5. `test/**/*.test.ts`
   Add parser or behavior coverage so the action contract stays stable.

Use `codex-actions` for natural-language-triggered host actions. Keep slash commands as an explicit fallback for users.

## Before Opening a PR

```bash
npm run test
npm run check
npm run build
```
