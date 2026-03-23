import { join } from "node:path";

import { getAppRoots, getWorkerRoot } from "./paths.js";
import { readJsonFile } from "./state/store.js";

export type CodexApprovalPolicy = "never" | "on-request" | "untrusted";
export type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access";

type FileConfig = {
  codexBin?: string;
  workRoot?: string;
  codexApprovalPolicy?: CodexApprovalPolicy;
  codexSandboxMode?: CodexSandboxMode;
};

export const APP_NAME = "codex-wechat-gateway";
export const DEFAULT_WECHAT_BASE_URL = "https://ilinkai.weixin.qq.com/";
export const DEFAULT_WECHAT_CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
const appRoots = getAppRoots();
export const APP_HOME = appRoots.appHome;
export const STATE_DIR = APP_HOME;
export const CACHE_DIR = appRoots.cacheDir;
export const CONFIG_DIR = appRoots.configDir;
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");
export const ENV_FILE = join(CONFIG_DIR, "env.sh");
const fileConfig = readJsonFile<FileConfig>(CONFIG_FILE, {});

export const DEFAULT_WORK_ROOT = getWorkerRoot(fileConfig.workRoot);
export const DEFAULT_CODEX_BIN = resolveDefaultCodexBin(fileConfig);
export const DEFAULT_CODEX_APPROVAL_POLICY = resolveApprovalPolicy(fileConfig);
export const DEFAULT_CODEX_SANDBOX_MODE = resolveSandboxMode(fileConfig);
export const WECHAT_STATE_DIR = appRoots.wechatDir;
export const LOG_DIR = appRoots.logsDir;
export const SESSION_DIR = appRoots.sessionsDir;
export const WECHAT_CREDENTIALS_FILE = join(WECHAT_STATE_DIR, "credentials.json");
export const WECHAT_ACCESS_FILE = join(WECHAT_STATE_DIR, "access.json");
export const WECHAT_SYNC_BUF_FILE = join(WECHAT_STATE_DIR, "sync_buf.txt");
export const AUDIT_LOG_FILE = join(LOG_DIR, "audit.log");
export const SESSION_MAP_FILE = join(SESSION_DIR, "sessions.json");

function resolveDefaultCodexBin(config: FileConfig): string {
  if (process.env.CODEX_BIN) {
    return process.env.CODEX_BIN;
  }
  if (config.codexBin) {
    return config.codexBin;
  }

  return "codex";
}

function resolveApprovalPolicy(config: FileConfig): CodexApprovalPolicy {
  const value = process.env.CODEX_APPROVAL_POLICY || config.codexApprovalPolicy;
  if (value === "never" || value === "on-request" || value === "untrusted") {
    return value;
  }
  return "never";
}

function resolveSandboxMode(config: FileConfig): CodexSandboxMode {
  const value = process.env.CODEX_SANDBOX_MODE || config.codexSandboxMode;
  if (value === "read-only" || value === "workspace-write" || value === "danger-full-access") {
    return value;
  }
  return "workspace-write";
}
