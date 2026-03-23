import { mkdirSync } from "node:fs";
import path from "node:path";

import { SessionManager } from "../gateway/session-manager.js";
import { getUserWorkspace } from "../gateway/workspace.js";
import type { ControlAction } from "../protocol/actions.js";
import { WechatApiClient } from "../wechat/api.js";

export async function executeControlActions(params: {
  senderId: string;
  sessions: SessionManager;
  actions: ControlAction[];
}): Promise<string[]> {
  const notices: string[] = [];

  for (const action of params.actions) {
    if (action.type === "workspace.set") {
      mkdirSync(action.path, { recursive: true, mode: 0o755 });
      params.sessions.setWorkspaceOverrideForUser(params.senderId, action.path);
      params.sessions.clearThreadIdForUser(params.senderId);
      notices.push(`已切换工作目录到：${action.path}\n下一条消息会在新目录的新 thread 中开始。`);
      continue;
    }

    if (action.type === "workspace.reset") {
      params.sessions.clearWorkspaceOverrideForUser(params.senderId);
      params.sessions.clearThreadIdForUser(params.senderId);
      notices.push(
        `已恢复默认工作目录：${getUserWorkspace(params.senderId)}\n下一条消息会在默认目录的新 thread 中开始。`
      );
      continue;
    }

    params.sessions.clearThreadIdForUser(params.senderId);
    notices.push("已重置当前 thread。下一条消息会创建新 thread。");
  }

  return notices;
}

export async function handleSlashControlCommand(params: {
  senderId: string;
  text: string;
  contextToken: string;
  sessions: SessionManager;
  api: WechatApiClient;
}): Promise<{ handled: boolean }> {
  const text = params.text.trim();
  if (!text.startsWith("/")) {
    return { handled: false };
  }

  const parts = text.split(/\s+/);
  const command = parts[0];

  if (command === "/thread" && parts[1] === "reset") {
    params.sessions.clearThreadIdForUser(params.senderId);
    await params.api.sendTextMessage({
      toUserId: params.senderId,
      text: "已重置当前 thread。下一条消息会创建新 thread。",
      contextToken: params.contextToken
    });
    return { handled: true };
  }

  if (command === "/workspace" && parts[1] === "reset") {
    params.sessions.clearWorkspaceOverrideForUser(params.senderId);
    params.sessions.clearThreadIdForUser(params.senderId);
    await params.api.sendTextMessage({
      toUserId: params.senderId,
      text: `已恢复默认工作目录，并重置 thread。\n默认目录：${getUserWorkspace(params.senderId)}`,
      contextToken: params.contextToken
    });
    return { handled: true };
  }

  if (command === "/workspace" && parts[1] === "set") {
    const workspace = text.slice("/workspace set".length).trim();
    if (!workspace) {
      await params.api.sendTextMessage({
        toUserId: params.senderId,
        text: "用法：/workspace set /absolute/path",
        contextToken: params.contextToken
      });
      return { handled: true };
    }
    if (!path.isAbsolute(workspace)) {
      await params.api.sendTextMessage({
        toUserId: params.senderId,
        text: "工作目录必须是绝对路径。",
        contextToken: params.contextToken
      });
      return { handled: true };
    }
    mkdirSync(workspace, { recursive: true, mode: 0o755 });
    params.sessions.setWorkspaceOverrideForUser(params.senderId, workspace);
    params.sessions.clearThreadIdForUser(params.senderId);
    await params.api.sendTextMessage({
      toUserId: params.senderId,
      text: `已切换工作目录，并重置 thread。\n当前目录：${workspace}`,
      contextToken: params.contextToken
    });
    return { handled: true };
  }

  if (command === "/workspace") {
    const currentWorkspace =
      params.sessions.getWorkspaceOverrideForUser(params.senderId) ?? getUserWorkspace(params.senderId);
    await params.api.sendTextMessage({
      toUserId: params.senderId,
      text: `当前工作目录：${currentWorkspace}`,
      contextToken: params.contextToken
    });
    return { handled: true };
  }

  return { handled: false };
}
