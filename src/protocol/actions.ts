import { accessSync, constants } from "node:fs";
import path from "node:path";

type OutboundAction =
  | { type: "image"; path: string }
  | { type: "file"; path: string };

export type ControlAction =
  | { type: "workspace.set"; path: string }
  | { type: "workspace.reset" }
  | { type: "thread.reset" };

export type ParsedActions = {
  cleanedText: string;
  sendActions: OutboundAction[];
  controlActions: ControlAction[];
};

const ACTION_BLOCK_RE = /```codex-actions\s*([\s\S]*?)```/g;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);

export function parseCodexActions(text: string): ParsedActions {
  const sendActions: OutboundAction[] = [];
  const controlActions: ControlAction[] = [];
  const cleanedText = text.replaceAll(ACTION_BLOCK_RE, (full, payload: string) => {
    try {
      const parsed = JSON.parse(payload.trim()) as {
        send?: Array<{ type?: string; path?: string }>;
        control?: Array<{ type?: string; path?: string }>;
      };
      for (const item of parsed.send ?? []) {
        if (!item.path || !path.isAbsolute(item.path)) {
          continue;
        }
        try {
          accessSync(item.path, constants.R_OK);
        } catch {
          continue;
        }
        if (item.type === "image" && isImagePath(item.path)) {
          sendActions.push({ type: "image", path: item.path });
        } else if (item.type === "file") {
          sendActions.push({ type: "file", path: item.path });
        }
      }
      for (const item of parsed.control ?? []) {
        if (item.type === "workspace.set") {
          if (item.path && path.isAbsolute(item.path)) {
            controlActions.push({ type: "workspace.set", path: item.path });
          }
        } else if (item.type === "workspace.reset") {
          controlActions.push({ type: "workspace.reset" });
        } else if (item.type === "thread.reset") {
          controlActions.push({ type: "thread.reset" });
        }
      }
      return "";
    } catch {
      return full;
    }
  }).trim();

  return { cleanedText, sendActions, controlActions };
}

function isImagePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}
