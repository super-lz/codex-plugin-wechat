import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import { writeAudit } from "./audit.js";
import { CodexAppServerClient } from "./codex/app-server-client.js";
import { DEFAULT_WORK_ROOT, LOG_DIR, STATE_DIR } from "./config.js";
import { MessageRouter } from "./gateway/message-router.js";
import { SessionManager } from "./gateway/session-manager.js";
import { getUserWorkspace, getWorkspaceRoot } from "./gateway/workspace.js";
import { createLaunchdPlist } from "./launchd.js";
import { log, logError } from "./logger.js";
import { parseCodexActions } from "./protocol/actions.js";
import {
  allowSender,
  approvePairing,
  denyPairing,
  formatAccessStatus,
  getAccessStatus,
  gateSender,
  removeSender,
  setPolicy
} from "./wechat/access.js";
import {
  loadWechatCredentials,
  startWechatLogin,
  waitForWechatLogin
} from "./wechat/auth.js";
import { WechatApiClient } from "./wechat/api.js";
import { sendFileFromPath, sendImageFromPath } from "./wechat/media.js";
import { chunkText, extractText } from "./wechat/message.js";
import { downloadInboundMedia } from "./wechat/inbound-media.js";
import { WechatPoller } from "./wechat/polling.js";

async function main(): Promise<void> {
  const command = process.argv[2] ?? "run";

  if (command === "login") {
    const qr = await startWechatLogin();
    const credentials = await waitForWechatLogin({ qrcode: qr.qrcode });
    log("wechat-auth", `login confirmed for ${credentials.accountId ?? "unknown-account"}`);
    return;
  }

  if (command === "codex-smoke") {
    const codex = new CodexAppServerClient();
    await codex.start();
    const thread = await codex.createThread({ cwd: process.cwd() });
    log("codex-smoke", `thread created: ${thread.thread.id}`);
    await codex.stop();
    return;
  }

  if (command === "access") {
    handleAccessCommand(process.argv.slice(3));
    return;
  }

  if (command === "install-launchd") {
    const scriptPath = resolve(process.cwd(), "scripts/run.sh");
    const plist = createLaunchdPlist({
      programArguments: ["/bin/zsh", scriptPath],
      workingDirectory: process.cwd()
    });
    process.stdout.write(
      [
        `wrote ${plist.plistPath}`,
        `load with: launchctl load -w ${plist.plistPath}`,
        `unload with: launchctl unload -w ${plist.plistPath}`
      ].join("\n") + "\n"
    );
    return;
  }

  if (command === "reset") {
    handleResetCommand(process.argv.slice(3));
    return;
  }

  if (command !== "run") {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const credentials = loadWechatCredentials();
  if (!credentials) {
    log("bootstrap", "no WeChat credentials found; run `npm run dev -- login` first");
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
    async (message) => {
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
      const workspaceDir = getUserWorkspace(message.from_user_id);
      const media = await downloadInboundMedia({
        message,
        workspaceDir
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
          `parsed ${actions.actions.length} action(s) for ${message.from_user_id}`
        );
        if (actions.actions.length > 0) {
          for (const action of actions.actions) {
            log("codex-actions", `${action.type}: ${action.path}`);
          }
        }
        const remainingActions = [...actions.actions];
        let firstCaption = actions.cleanedText;
        for (const action of remainingActions) {
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
          } else if (action.type === "file") {
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

        if (firstCaption || remainingActions.length === 0) {
          if (remainingActions.length === 0) {
            log("codex-actions", "no executable actions found; falling back to text reply");
          }
          const chunks = chunkText(firstCaption || "已收到，但没有可发送的文本回复。");
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
    },
    credentials
  );

  await poller.start();
}

function printUsage(): void {
  process.stderr.write(
    [
      "Usage:",
      "  npm run dev -- login       # scan QR and save WeChat credentials",
      "  npm run dev -- run         # start Codex client and WeChat poller",
      "  npm run dev -- codex-smoke # verify Codex App Server connectivity",
      "  npm run dev -- access ...  # manage WeChat allowlist and pairings",
      "  npm run dev -- reset ...   # clear saved state or workspaces",
      "  npm run dev -- install-launchd"
    ].join("\n") + "\n"
  );
}

function handleResetCommand(args: string[]): void {
  const scope = args[0] ?? "state";

  if (scope === "state") {
    removeIfExists(STATE_DIR);
    process.stdout.write(`removed state: ${STATE_DIR}\n`);
    return;
  }

  if (scope === "all") {
    removeIfExists(STATE_DIR);
    removeIfExists(DEFAULT_WORK_ROOT);
    process.stdout.write(`removed state: ${STATE_DIR}\n`);
    process.stdout.write(`removed workspaces: ${DEFAULT_WORK_ROOT}\n`);
    return;
  }

  throw new Error(`unknown reset scope: ${scope}`);
}

function removeIfExists(target: string): void {
  if (!existsSync(target)) {
    return;
  }
  rmSync(target, { recursive: true, force: true });
}

function handleAccessCommand(args: string[]): void {
  const subcommand = args[0] ?? "status";

  if (subcommand === "status") {
    process.stdout.write(formatAccessStatus() + "\n");
    return;
  }

  if (subcommand === "pair") {
    const code = args[1];
    if (!code) {
      throw new Error("missing pairing code");
    }
    const senderId = approvePairing(code);
    if (!senderId) {
      throw new Error(`pairing code not found: ${code}`);
    }
    process.stdout.write(`approved ${senderId}\n`);
    return;
  }

  if (subcommand === "deny") {
    const code = args[1];
    if (!code) {
      throw new Error("missing pairing code");
    }
    if (!denyPairing(code)) {
      throw new Error(`pairing code not found: ${code}`);
    }
    process.stdout.write(`denied ${code}\n`);
    return;
  }

  if (subcommand === "allow") {
    const senderId = args[1];
    if (!senderId) {
      throw new Error("missing senderId");
    }
    allowSender(senderId);
    process.stdout.write(`allowed ${senderId}\n`);
    return;
  }

  if (subcommand === "remove") {
    const senderId = args[1];
    if (!senderId) {
      throw new Error("missing senderId");
    }
    removeSender(senderId);
    process.stdout.write(`removed ${senderId}\n`);
    return;
  }

  if (subcommand === "policy") {
    const policy = args[1];
    if (policy !== "pairing" && policy !== "allowlist" && policy !== "disabled") {
      throw new Error("policy must be one of: pairing, allowlist, disabled");
    }
    setPolicy(policy);
    process.stdout.write(`policy ${policy}\n`);
    return;
  }

  throw new Error(`unknown access subcommand: ${subcommand}`);
}

main().catch((error) => {
  logError("main", error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
