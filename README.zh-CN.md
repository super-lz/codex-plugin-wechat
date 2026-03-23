# Codex WeChat Gateway

[English](./README.md)

把微信消息转发给本机 Codex，并把 Codex 回复发回微信。

![微信演示](./assets/demo.jpg)

## 概览

- 微信消息转给 Codex
- Codex 回复回到微信
- 支持 pairing 和 allowlist 权限控制
- 每个已授权用户都有独立工作目录
- 支持双向图片和文件传输

## 快速开始

```bash
cd /path/to/codex-plugin-wechat
npm install
npm run smoke
npm run login
npm run wechat
```

当 bot 给你配对码后，执行：

```bash
npm run access -- pair <code>
```

## 路径

默认有两个根目录：

- `gateway home`: `$HOME/.codex-plugin-wechat`
- `worker root`: `$HOME/codex-plugin-wechat-worker`

默认结构：

```text
$HOME/.codex-plugin-wechat/
  cache/
  config/config.json
  logs/
  sessions/
  wechat/

$HOME/codex-plugin-wechat-worker/
  users/<user-workspace>/
```

收到的文件会放到：

```text
$HOME/.codex-plugin-wechat/cache/users/<user>/inbound/
```

## 配置

配置文件：

```bash
$HOME/.codex-plugin-wechat/config/config.json
```

持久环境变量文件：

```bash
$HOME/.codex-plugin-wechat/config/env.sh
```

示例：

```json
{
  "codexBin": "/path/to/codex",
  "workRoot": "$HOME/codex-plugin-wechat-worker",
  "codexApprovalPolicy": "never",
  "codexSandboxMode": "workspace-write"
}
```

可选环境变量覆盖：

```bash
export CODEX_BIN=/绝对路径/codex
export CODEX_PLUGIN_WECHAT_HOME=/绝对路径/.codex-plugin-wechat
export WECHAT_CODEX_WORKROOT=/绝对路径/codex-plugin-wechat-worker
export CODEX_APPROVAL_POLICY=never
export CODEX_SANDBOX_MODE=workspace-write
```

如果你希望启动脚本自动加载环境变量，就把它们写进 `config/env.sh`。
示例：
- [env.example.sh](./env.example.sh)

## 文件传输

如果要让 Codex 把本地文件或图片发回微信，或者让网关切工作目录、重置 thread，它都可以在最终回复里带 `codex-actions`：

````text
```codex-actions
{
  "send": [
    { "type": "image", "path": "/absolute/path/out.png" },
    { "type": "file", "path": "/absolute/path/report.pdf" }
  ],
  "control": [
    { "type": "workspace.set", "path": "/absolute/path/project" },
    { "type": "thread.reset" }
  ]
}
```
````

规则：

- 只接受绝对本地路径
- `image` 用于微信内联展示
- `file` 用于附件发送
- `workspace.set`、`workspace.reset`、`thread.reset` 是支持的宿主控制动作
- 微信可能会转码 `image`；如果要保留原始格式，请用 `file`

## 常用命令

```bash
npm run smoke
npm run login
npm run wechat
npm run access -- status
npm run access -- pair <code>
npm run reset -- state
npm run reset -- all
```

`reset -- state` 清空网关状态，`reset -- all` 还会删除用户工作目录。

## 微信内置控制

你既可以直接用自然语言说“切到 /path/to/project 继续处理”，也可以显式使用这些命令：

```text
/workspace
/workspace set /absolute/path
/workspace reset
/thread reset
```

切换工作目录时会自动重置当前 thread，所以下一条消息会在新目录里新开 thread。

## 开发

```bash
npm run test
npm run check
npm run build
```

见 [CONTRIBUTING.md](./CONTRIBUTING.md)。
