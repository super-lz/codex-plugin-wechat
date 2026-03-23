import qrcodeTerminal from "qrcode-terminal";

import {
  DEFAULT_WECHAT_BASE_URL,
  DEFAULT_WECHAT_CDN_BASE_URL,
  WECHAT_CREDENTIALS_FILE
} from "../config.js";
import { log } from "../logger.js";
import { readJsonFile, writeJsonFile } from "../state/store.js";
import { WechatApiClient } from "./api.js";
import type { WechatCredentials } from "./types.js";

type QrStatusResponse = {
  status?: string;
  bot_token?: string;
  baseurl?: string;
  ilink_bot_id?: string;
  ilink_user_id?: string;
};

export function loadWechatCredentials(): WechatCredentials | null {
  return readJsonFile<WechatCredentials | null>(WECHAT_CREDENTIALS_FILE, null);
}

export function saveWechatCredentials(credentials: WechatCredentials): void {
  writeJsonFile(WECHAT_CREDENTIALS_FILE, credentials);
}

export async function startWechatLogin(baseUrl = DEFAULT_WECHAT_BASE_URL): Promise<{ qrcode: string; url: string }> {
  const api = new WechatApiClient({ token: "", baseUrl });
  const qr = await api.fetchQrCode();
  qrcodeTerminal.generate(qr.url, { small: true });
  log("wechat-auth", `scan QR or open in WeChat: ${qr.url}`);
  return qr;
}

export async function waitForWechatLogin(params: {
  qrcode: string;
  baseUrl?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<WechatCredentials> {
  const timeoutMs = params.timeoutMs ?? 5 * 60_000;
  const pollIntervalMs = params.pollIntervalMs ?? 3_000;
  const api = new WechatApiClient({ token: "", baseUrl: params.baseUrl ?? DEFAULT_WECHAT_BASE_URL });
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await api.getQrCodeStatus(params.qrcode) as QrStatusResponse;
    if (result.status === "confirmed" && result.bot_token) {
      const credentials: WechatCredentials = {
        token: result.bot_token,
        baseUrl: result.baseurl ?? params.baseUrl ?? DEFAULT_WECHAT_BASE_URL,
        cdnBaseUrl: DEFAULT_WECHAT_CDN_BASE_URL,
        accountId: result.ilink_bot_id,
        userId: result.ilink_user_id
      };
      saveWechatCredentials(credentials);
      return credentials;
    }
    if (result.status === "expired") {
      throw new Error("wechat QR code expired");
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error("wechat login timed out");
}
