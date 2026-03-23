import { createDecipheriv } from "node:crypto";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_WECHAT_CDN_BASE_URL } from "../config.js";
import type { WechatInboundMessage, WechatMessageItem } from "./types.js";

export type InboundMedia = {
  imagePaths: string[];
  filePaths: string[];
  notes: string[];
};

export async function downloadInboundMedia(params: {
  message: WechatInboundMessage;
  workspaceDir: string;
  cdnBaseUrl?: string;
}): Promise<InboundMedia> {
  const inboundDir = path.join(params.workspaceDir, "inbound");
  mkdirSync(inboundDir, { recursive: true, mode: 0o755 });

  const result: InboundMedia = {
    imagePaths: [],
    filePaths: [],
    notes: []
  };

  for (const item of params.message.item_list ?? []) {
    if (item.type === 2) {
      const downloaded = await downloadImageItem(item, inboundDir, params.cdnBaseUrl);
      if (downloaded) {
        result.imagePaths.push(downloaded);
        result.notes.push(`收到图片，已保存到 ${downloaded}`);
      }
    } else if (item.type === 4) {
      const downloaded = await downloadFileItem(item, inboundDir, params.cdnBaseUrl);
      if (downloaded) {
        result.filePaths.push(downloaded);
        result.notes.push(`收到文件，已保存到 ${downloaded}`);
      }
    }
  }

  return result;
}

async function downloadImageItem(
  item: WechatMessageItem,
  inboundDir: string,
  cdnBaseUrl = DEFAULT_WECHAT_CDN_BASE_URL
): Promise<string | null> {
  const query = item.image_item?.media?.encrypt_query_param;
  const aesKey = item.image_item?.aeskey
    ? Buffer.from(item.image_item.aeskey, "hex").toString("base64")
    : item.image_item?.media?.aes_key;
  if (!query || !aesKey) {
    return null;
  }
  const buffer = await downloadAndDecryptBuffer(query, aesKey, cdnBaseUrl);
  const filePath = path.join(inboundDir, `image-${Date.now()}.png`);
  await writeFile(filePath, buffer);
  return filePath;
}

async function downloadFileItem(
  item: WechatMessageItem,
  inboundDir: string,
  cdnBaseUrl = DEFAULT_WECHAT_CDN_BASE_URL
): Promise<string | null> {
  const query = item.file_item?.media?.encrypt_query_param;
  const aesKey = item.file_item?.media?.aes_key;
  if (!query || !aesKey) {
    return null;
  }
  const buffer = await downloadAndDecryptBuffer(query, aesKey, cdnBaseUrl);
  const fileName = sanitizeFilename(item.file_item?.file_name || `file-${Date.now()}.bin`);
  const filePath = path.join(inboundDir, fileName);
  await writeFile(filePath, buffer);
  return filePath;
}

async function downloadAndDecryptBuffer(
  encryptedQueryParam: string,
  aesKeyBase64: string,
  cdnBaseUrl: string
): Promise<Buffer> {
  const url = `${cdnBaseUrl.replace(/\/?$/, "/")}download?encrypted_query_param=${encodeURIComponent(encryptedQueryParam)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`CDN download failed: ${res.status}`);
  }
  const encrypted = Buffer.from(await res.arrayBuffer());
  const key = parseAesKey(aesKeyBase64);
  const decipher = createDecipheriv("aes-128-ecb", key, null);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function parseAesKey(aesKeyBase64: string): Buffer {
  const decoded = Buffer.from(aesKeyBase64, "base64");
  if (decoded.length === 16) {
    return decoded;
  }
  if (decoded.length === 32 && /^[0-9a-fA-F]{32}$/.test(decoded.toString("ascii"))) {
    return Buffer.from(decoded.toString("ascii"), "hex");
  }
  throw new Error("invalid aes key");
}

function sanitizeFilename(fileName: string): string {
  return fileName.replaceAll(/[^\w.-]+/g, "-");
}
