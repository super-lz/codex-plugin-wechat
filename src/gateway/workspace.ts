import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_WORK_ROOT } from "../config.js";

export function getWorkspaceRoot(): string {
  mkdirSync(DEFAULT_WORK_ROOT, { recursive: true, mode: 0o755 });
  return DEFAULT_WORK_ROOT;
}

export function getUserWorkspace(senderId: string): string {
  const root = getWorkspaceRoot();
  const usersDir = join(root, "users");
  mkdirSync(usersDir, { recursive: true, mode: 0o755 });
  const workspace = join(usersDir, sanitizeSenderId(senderId));
  mkdirSync(workspace, { recursive: true, mode: 0o755 });
  return workspace;
}

export function sanitizeSenderId(senderId: string): string {
  return senderId
    .replaceAll(/[^a-zA-Z0-9._-]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replace(/^-/, "")
    .replace(/-$/, "") || "user";
}
