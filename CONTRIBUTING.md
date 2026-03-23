# Contributing

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

- gateway home: `$HOME/codex-plugin-wechat`
- worker root: `$HOME/codex-plugin-wechat-worker`

Overrides:

```bash
export CODEX_PLUGIN_WECHAT_HOME=/absolute/path/to/codex-plugin-wechat
export WECHAT_CODEX_WORKROOT=/absolute/path/to/codex-plugin-wechat-worker
```

## Useful Commands

```bash
npm run smoke
npm run login
npm run wechat
npm run access -- status
```

## Before Opening a PR

```bash
npm run test
npm run check
npm run build
```
