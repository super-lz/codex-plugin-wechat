import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_WECHAT_CDN_BASE_URL } from "../config.js";
import { WechatApiClient } from "./api.js";

function aesEcbPaddedSize(plaintextSize: number): number {
  return Math.ceil((plaintextSize + 1) / 16) * 16;
}

function encryptAesEcb(plaintext: Buffer, key: Buffer): Buffer {
  const cipher = createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

function buildCdnUploadUrl(params: {
  cdnBaseUrl: string;
  uploadParam: string;
  filekey: string;
}): string {
  return `${params.cdnBaseUrl}/upload?encrypted_query_param=${encodeURIComponent(params.uploadParam)}&filekey=${encodeURIComponent(params.filekey)}`;
}

export async function sendImageFromPath(params: {
  api: WechatApiClient;
  filePath: string;
  toUserId: string;
  contextToken: string;
  caption?: string;
  cdnBaseUrl?: string;
}): Promise<void> {
  const plaintext = await readFile(params.filePath);
  const rawsize = plaintext.length;
  const rawfilemd5 = createHash("md5").update(plaintext).digest("hex");
  const filesize = aesEcbPaddedSize(rawsize);
  const filekey = randomBytes(16).toString("hex");
  const aeskey = randomBytes(16);

  const upload = await params.api.getUploadUrl({
    filekey,
    toUserId: params.toUserId,
    rawsize,
    rawfilemd5,
    filesize,
    aeskey: aeskey.toString("hex"),
    mediaType: 1
  });

  if (!upload.upload_param) {
    throw new Error("getuploadurl returned no upload_param");
  }

  const ciphertext = encryptAesEcb(plaintext, aeskey);
  const cdnBaseUrl = params.cdnBaseUrl ?? DEFAULT_WECHAT_CDN_BASE_URL;
  const cdnUrl = buildCdnUploadUrl({
    cdnBaseUrl,
    uploadParam: upload.upload_param,
    filekey
  });

  const uploadRes = await fetch(cdnUrl, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(ciphertext)
  });
  if (!uploadRes.ok) {
    throw new Error(`CDN upload failed: ${uploadRes.status}`);
  }

  const downloadEncryptedQueryParam = uploadRes.headers.get("x-encrypted-param");
  if (!downloadEncryptedQueryParam) {
    throw new Error("CDN upload response missing x-encrypted-param");
  }

  const itemList: object[] = [];
  if (params.caption?.trim()) {
    itemList.push({ type: 1, text_item: { text: params.caption.trim() } });
  }
  itemList.push({
    type: 2,
    image_item: {
      media: {
        encrypt_query_param: downloadEncryptedQueryParam,
        aes_key: Buffer.from(aeskey.toString("hex")).toString("base64"),
        encrypt_type: 1
      },
      mid_size: filesize
    }
  });

  await params.api.sendRawMessage({
    toUserId: params.toUserId,
    contextToken: params.contextToken,
    itemList
  });
}

export async function sendFileFromPath(params: {
  api: WechatApiClient;
  filePath: string;
  toUserId: string;
  contextToken: string;
  caption?: string;
  cdnBaseUrl?: string;
}): Promise<void> {
  const plaintext = await readFile(params.filePath);
  const rawsize = plaintext.length;
  const rawfilemd5 = createHash("md5").update(plaintext).digest("hex");
  const filesize = aesEcbPaddedSize(rawsize);
  const filekey = randomBytes(16).toString("hex");
  const aeskey = randomBytes(16);

  const upload = await params.api.getUploadUrl({
    filekey,
    toUserId: params.toUserId,
    rawsize,
    rawfilemd5,
    filesize,
    aeskey: aeskey.toString("hex"),
    mediaType: 3
  });

  if (!upload.upload_param) {
    throw new Error("getuploadurl returned no upload_param");
  }

  const ciphertext = encryptAesEcb(plaintext, aeskey);
  const cdnBaseUrl = params.cdnBaseUrl ?? DEFAULT_WECHAT_CDN_BASE_URL;
  const cdnUrl = buildCdnUploadUrl({
    cdnBaseUrl,
    uploadParam: upload.upload_param,
    filekey
  });

  const uploadRes = await fetch(cdnUrl, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(ciphertext)
  });
  if (!uploadRes.ok) {
    throw new Error(`CDN upload failed: ${uploadRes.status}`);
  }

  const downloadEncryptedQueryParam = uploadRes.headers.get("x-encrypted-param");
  if (!downloadEncryptedQueryParam) {
    throw new Error("CDN upload response missing x-encrypted-param");
  }

  const itemList: object[] = [];
  if (params.caption?.trim()) {
    itemList.push({ type: 1, text_item: { text: params.caption.trim() } });
  }
  itemList.push({
    type: 4,
    file_item: {
      media: {
        encrypt_query_param: downloadEncryptedQueryParam,
        aes_key: Buffer.from(aeskey.toString("hex")).toString("base64"),
        encrypt_type: 1
      },
      file_name: path.basename(params.filePath),
      len: String(rawsize)
    }
  });

  await params.api.sendRawMessage({
    toUserId: params.toUserId,
    contextToken: params.contextToken,
    itemList
  });
}
