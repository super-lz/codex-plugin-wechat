import { accessSync, constants } from "node:fs";
import path from "node:path";

type OutboundAction =
  | { type: "image"; path: string }
  | { type: "file"; path: string };

export type ParsedActions = {
  cleanedText: string;
  actions: OutboundAction[];
};

const ACTION_BLOCK_RE = /```codex-actions\s*([\s\S]*?)```/g;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);

export function parseCodexActions(text: string): ParsedActions {
  const actions: OutboundAction[] = [];
  const cleanedText = text.replaceAll(ACTION_BLOCK_RE, (full, payload: string) => {
    try {
      const parsed = JSON.parse(payload.trim()) as {
        send?: Array<{ type?: string; path?: string }>;
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
          actions.push({ type: "image", path: item.path });
        } else if (item.type === "file") {
          actions.push({ type: "file", path: item.path });
        }
      }
      return "";
    } catch {
      return full;
    }
  }).trim();

  return { cleanedText, actions };
}

function isImagePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}
