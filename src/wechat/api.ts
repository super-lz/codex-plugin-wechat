import { randomBytes } from "node:crypto";

import { DEFAULT_WECHAT_BASE_URL } from "../config.js";
import type { WechatCredentials, WechatGetUpdatesResponse } from "./types.js";

function randomWechatUin(): string {
  const uint32 = randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf8").toString("base64");
}

export class WechatApiClient {
  constructor(private readonly credentials: WechatCredentials) {}

  async getUpdates(syncBuffer: string, timeoutMs = 35_000): Promise<WechatGetUpdatesResponse> {
    return this.fetchJson("ilink/bot/getupdates", {
      get_updates_buf: syncBuffer,
      base_info: { channel_version: "0.1.0" }
    }, timeoutMs);
  }

  async sendTextMessage(params: {
    toUserId: string;
    text: string;
    contextToken: string;
    retries?: number;
  }): Promise<unknown> {
    const retries = params.retries ?? 2;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await this.fetchJson("ilink/bot/sendmessage", {
          msg: {
            from_user_id: "",
            to_user_id: params.toUserId,
            client_id: `codex-wechat-${Date.now()}`,
            message_type: 2,
            message_state: 2,
            item_list: [{ type: 1, text_item: { text: params.text } }],
            context_token: params.contextToken
          },
          base_info: { channel_version: "0.1.0" }
        });
      } catch (error) {
        lastError = error;
        if (attempt >= retries) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async getUploadUrl(params: {
    filekey: string;
    toUserId: string;
    rawsize: number;
    rawfilemd5: string;
    filesize: number;
    aeskey: string;
    mediaType?: number;
  }): Promise<{ upload_param?: string }> {
    return this.fetchJson("ilink/bot/getuploadurl", {
      filekey: params.filekey,
      media_type: params.mediaType ?? 1,
      to_user_id: params.toUserId,
      rawsize: params.rawsize,
      rawfilemd5: params.rawfilemd5,
      filesize: params.filesize,
      no_need_thumb: true,
      aeskey: params.aeskey,
      base_info: { channel_version: "0.1.0" }
    });
  }

  async sendRawMessage(params: {
    toUserId: string;
    contextToken: string;
    itemList: object[];
  }): Promise<unknown> {
    return this.fetchJson("ilink/bot/sendmessage", {
      msg: {
        from_user_id: "",
        to_user_id: params.toUserId,
        client_id: `codex-wechat-${Date.now()}`,
        message_type: 2,
        message_state: 2,
        item_list: params.itemList,
        context_token: params.contextToken
      },
      base_info: { channel_version: "0.1.0" }
    });
  }

  async fetchQrCode(): Promise<{ qrcode: string; url: string }> {
    const baseUrl = normalizeBaseUrl(this.credentials.baseUrl || DEFAULT_WECHAT_BASE_URL);
    const res = await fetch(`${baseUrl}ilink/bot/get_bot_qrcode?bot_type=3`);
    if (!res.ok) {
      throw new Error(`get_bot_qrcode failed: ${res.status}`);
    }
    const data = await res.json() as { qrcode: string; qrcode_img_content: string };
    return {
      qrcode: data.qrcode,
      url: data.qrcode_img_content
    };
  }

  async getQrCodeStatus(qrcode: string): Promise<unknown> {
    const baseUrl = normalizeBaseUrl(this.credentials.baseUrl || DEFAULT_WECHAT_BASE_URL);
    const res = await fetch(`${baseUrl}ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`);
    if (!res.ok) {
      throw new Error(`get_qrcode_status failed: ${res.status}`);
    }
    return res.json();
  }

  private async fetchJson(endpoint: string, body: object, timeoutMs = 15_000): Promise<any> {
    const baseUrl = normalizeBaseUrl(this.credentials.baseUrl);
    const url = new URL(endpoint, baseUrl);
    const bodyString = JSON.stringify(body);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "AuthorizationType": "ilink_bot_token",
          "Authorization": `Bearer ${this.credentials.token}`,
          "X-WECHAT-UIN": randomWechatUin(),
          "Content-Length": String(Buffer.byteLength(bodyString, "utf8"))
        },
        body: bodyString,
        signal: controller.signal
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`${endpoint} ${res.status}: ${text}`);
      }
      return JSON.parse(text);
    } finally {
      clearTimeout(timer);
    }
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return (baseUrl || DEFAULT_WECHAT_BASE_URL).replace(/\/?$/, "/");
}
