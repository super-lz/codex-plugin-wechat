import { mkdirSync } from "node:fs";

import { writeAudit } from "../audit.js";
import { CodexAppServerClient } from "../codex/app-server-client.js";
import { LOG_DIR } from "../config.js";
import { executeControlActions, handleSlashControlCommand } from "./control.js";
import { MessageRouter } from "../gateway/message-router.js";
import { SessionManager } from "../gateway/session-manager.js";
import { getUserCacheDir, getWorkspaceRoot } from "../gateway/workspace.js";
import { log, logError } from "../logger.js";
import { parseCodexActions } from "../protocol/actions.js";
import { gateSender } from "../wechat/access.js";
import { loadWechatCredentials } from "../wechat/auth.js";
import { WechatApiClient } from "../wechat/api.js";
import { downloadInboundMedia } from "../wechat/inbound-media.js";
import { chunkText, extractText } from "../wechat/message.js";
import { sendFileFromPath, sendImageFromPath } from "../wechat/media.js";
import { WechatPoller } from "../wechat/polling.js";
import type { WechatInboundMessage } from "../wechat/types.js";

export async function runGateway(): Promise<void> {
  const credentials = loadWechatCredentials();
  if (!credentials) {
    log("bootstrap", "no WeChat credentials found; run `npm run login` first");
    return;
  }

  mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });

  const codex = new CodexAppServerClient();
  await codex.start();
  codex.on("agentMessageDelta", (event) => {
    log("codex-delta", `${event.threadId}/${event.turnId}: ${event.delta}`);
  });

  const sessions = new SessionManager();
  const router = new MessageRouter(codex, sessions);
  log("workspace", `user workspaces under ${getWorkspaceRoot()}`);

  const api = new WechatApiClient(credentials);
  const poller = new WechatPoller(
    api,
    (message) => handleInboundMessage(message, router, sessions, api),
    credentials
  );
  await poller.start();
}

async function handleInboundMessage(
  message: WechatInboundMessage,
  router: MessageRouter,
  sessions: SessionManager,
  api: WechatApiClient
): Promise<void> {
  if (message.message_type !== 1 || !message.from_user_id || !message.context_token) {
    return;
  }

  const gate = gateSender(message.from_user_id);
  if (gate.action === "drop") {
    writeAudit({ kind: "wechat_drop", senderId: message.from_user_id, ok: true });
    return;
  }
  if (gate.action === "pair") {
    const lead = gate.isResend ? "仍在等待配对" : "需要配对验证";
    writeAudit({
      kind: "wechat_pair_requested",
      senderId: message.from_user_id,
      detail: gate.code,
      ok: true
    });
    await api.sendTextMessage({
      toUserId: message.from_user_id,
      text: `${lead}，请在本机终端执行：\n\nnpm run access -- pair ${gate.code}`,
      contextToken: message.context_token
    });
    return;
  }

  const text = extractText(message);
  const controlResult = await handleControlCommand({
    senderId: message.from_user_id,
    text,
    contextToken: message.context_token,
    sessions,
    api
  });
  if (controlResult.handled) {
    return;
  }
  const cacheDir = getUserCacheDir(message.from_user_id);
  const media = await downloadInboundMedia({
    message,
    cacheDir
  }).catch((error) => {
    const detail = error instanceof Error ? error.message : String(error);
    logError("wechat-media", detail);
    writeAudit({ kind: "wechat_media_error", senderId: message.from_user_id, detail, ok: false });
    return { imagePaths: [], filePaths: [], notes: [] };
  });
  const promptParts = [text, ...media.notes].filter(Boolean);
  if (promptParts.length === 0) {
    return;
  }

  log("wechat-message", `${message.from_user_id}: ${text || "(media only)"}`);
  writeAudit({
    kind: "wechat_inbound",
    senderId: message.from_user_id,
    detail: promptParts.join("\n"),
    ok: true
  });

  try {
    const result = await router.handleUserText({
      senderId: message.from_user_id,
      text: promptParts.join("\n\n"),
      localImagePaths: media.imagePaths
    });
    const threadId = result.threadId;
    writeAudit({
      kind: "codex_reply",
      senderId: message.from_user_id,
      threadId,
      detail: result.reply,
      ok: true
    });

    const actions = parseCodexActions(result.reply);
    log(
      "codex-actions",
      `parsed ${actions.sendActions.length} send action(s) and ${actions.controlActions.length} control action(s) for ${message.from_user_id}`
    );
    for (const action of actions.sendActions) {
      log("codex-actions", `${action.type}: ${action.path}`);
    }
    for (const action of actions.controlActions) {
      log(
        "codex-actions",
        action.type === "workspace.set" ? `${action.type}: ${action.path}` : action.type
      );
    }

    const controlNotices = await executeControlActions({
      senderId: message.from_user_id,
      sessions,
      actions: actions.controlActions
    });

    let firstCaption = actions.cleanedText;
    for (const action of actions.sendActions) {
      if (action.type === "image") {
        await sendImageFromPath({
          api,
          filePath: action.path,
          toUserId: message.from_user_id,
          contextToken: message.context_token,
          caption: firstCaption
        });
        writeAudit({
          kind: "wechat_image_outbound",
          senderId: message.from_user_id,
          threadId,
          detail: action.path,
          ok: true
        });
      } else {
        await sendFileFromPath({
          api,
          filePath: action.path,
          toUserId: message.from_user_id,
          contextToken: message.context_token,
          caption: firstCaption
        });
        writeAudit({
          kind: "wechat_file_outbound",
          senderId: message.from_user_id,
          threadId,
          detail: action.path,
          ok: true
        });
      }
      firstCaption = "";
    }

    const finalText = [firstCaption, ...controlNotices].filter(Boolean).join("\n\n");
    if (finalText || actions.sendActions.length === 0) {
      if (actions.sendActions.length === 0 && actions.controlActions.length === 0) {
        log("codex-actions", "no executable actions found; falling back to text reply");
      }
      const chunks = chunkText(finalText || "已收到，但没有可发送的文本回复。");
      for (const chunk of chunks) {
        await api.sendTextMessage({
          toUserId: message.from_user_id,
          text: chunk,
          contextToken: message.context_token
        });
      }
      writeAudit({
        kind: "wechat_outbound",
        senderId: message.from_user_id,
        threadId,
        detail: `chunks=${chunks.length} cwd=${result.cwd}`,
        ok: true
      });
    }
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    logError("bridge", fallback);
    writeAudit({
      kind: "bridge_error",
      senderId: message.from_user_id,
      detail: fallback,
      ok: false
    });
    await api.sendTextMessage({
      toUserId: message.from_user_id,
      text: `处理失败：${fallback}`,
      contextToken: message.context_token
    });
  }
}

async function handleControlCommand(params: {
  senderId: string;
  text: string;
  contextToken: string;
  sessions: SessionManager;
  api: WechatApiClient;
}): Promise<{ handled: boolean }> {
  return handleSlashControlCommand(params);
}
