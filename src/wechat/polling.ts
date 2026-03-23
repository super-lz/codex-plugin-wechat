import { WECHAT_SYNC_BUF_FILE } from "../config.js";
import { log, logError } from "../logger.js";
import { readTextFile, writeTextFile } from "../state/store.js";
import { WechatApiClient } from "./api.js";
import type { WechatCredentials, WechatInboundMessage } from "./types.js";

export class WechatPoller {
  private syncBuffer = readTextFile(WECHAT_SYNC_BUF_FILE, "").trim();
  private running = false;

  constructor(
    private readonly api: WechatApiClient,
    private readonly onMessage: (message: WechatInboundMessage) => Promise<void>,
    private readonly credentials: WechatCredentials
  ) {}

  async start(): Promise<void> {
    this.running = true;
    log("wechat-poller", `polling started for ${this.credentials.accountId ?? "unknown-account"}`);
    while (this.running) {
      try {
        const response = await this.api.getUpdates(this.syncBuffer);
        if (response.get_updates_buf) {
          this.syncBuffer = response.get_updates_buf;
          writeTextFile(WECHAT_SYNC_BUF_FILE, this.syncBuffer);
        }
        for (const message of response.msgs ?? []) {
          await this.onMessage(message);
        }
      } catch (error) {
        logError("wechat-poller", String(error));
        await sleep(2_000);
      }
    }
  }

  stop(): void {
    this.running = false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
