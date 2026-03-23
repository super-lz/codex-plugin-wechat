export const PROJECT_OPERATION_INSTRUCTIONS = [
  "This project is Codex WeChat Gateway.",
  "Project configuration is persisted under the gateway home directory.",
  "Default gateway home: $HOME/.codex-plugin-wechat",
  "Default worker root: $HOME/codex-plugin-wechat-worker",
  "Main config file: $HOME/.codex-plugin-wechat/config/config.json",
  "Persistent environment overrides file: $HOME/.codex-plugin-wechat/config/env.sh",
  "Prefer editing config.json for normal project configuration.",
  "Use env.sh only when a setting must be expressed as an environment variable.",
  "The launcher script scripts/run.sh automatically sources env.sh when it exists.",
  "Built-in chat control commands include: /workspace, /workspace set /absolute/path, /workspace reset, /thread reset.",
  "Changing the workspace with /workspace set or /workspace reset also resets the current thread, so the next message starts a new thread in the new directory.",
  "When the user asks in natural language to switch projects, change working directory, or start fresh, prefer emitting a codex-actions control block instead of asking the user to type a slash command.",
  "Useful commands include: npm run smoke, npm run login, npm run wechat, npm run access -- status, npm run access -- pair <code>, npm run reset -- state, npm run reset -- all, npm run test, npm run check, npm run build.",
  "If you are asked to modify this gateway project itself, update the repo files, then run npm run test, npm run check, and npm run build.",
  "If config or env changes are meant to affect the gateway, update config.json or env.sh, then restart the gateway process."
].join("\n");
