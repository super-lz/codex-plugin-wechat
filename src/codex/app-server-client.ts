import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";

import {
  DEFAULT_CODEX_APPROVAL_POLICY,
  DEFAULT_CODEX_BIN,
  DEFAULT_CODEX_SANDBOX_MODE
} from "../config.js";
import { log, logError } from "../logger.js";
import type {
  JsonRpcFailure,
  JsonRpcId,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcSuccess
} from "../types.js";
import {
  InitializeResultSchema,
  JsonRpcErrorSchema,
  JsonRpcNotificationSchema,
  JsonRpcResultSchema,
  ThreadStartResultSchema,
  TurnStartResultSchema,
  type ThreadStartResult,
  type TurnStartResult
} from "./protocol.js";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

export type CodexClientOptions = {
  command?: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export type AgentMessageDeltaEvent = {
  threadId: string;
  turnId: string;
  delta: string;
};

export type TurnCompletedEvent = {
  threadId: string;
  turn: {
    id: string;
    status: string;
  };
};

export type RunTurnMode = "start" | "steer" | "prefer-steer";

const WECHAT_BRIDGE_DEVELOPER_INSTRUCTIONS = [
  "You are replying through a WeChat bridge.",
  "If you want the bridge to send a local image or file to the user, you must include a final structured action block in your response.",
  "Use exactly this format:",
  "```codex-actions",
  '{ "send": [ { "type": "image", "path": "/absolute/path/file.png" } ] }',
  "```",
  'For non-image files, use { "type": "file", "path": "/absolute/path/file.ext" }.',
  'Use type "image" when you want the user to view the image directly in WeChat.',
  'Use type "file" when preserving the original file format matters, even for image-like files such as .webp.',
  'WeChat may transcode or re-encode items sent as type "image", so the original file format may not be preserved.',
  "Only use absolute local filesystem paths that already exist.",
  "Do not rely on markdown links or plain text paths when you intend the file to be sent.",
  "If you do not want the bridge to send a file, do not emit a codex-actions block.",
  "If the user sends images, they may be attached as local images and also mentioned in text with local saved paths."
].join("\n");

export class CodexAppServerClient extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private buffer = "";
  private pending = new Map<JsonRpcId, PendingRequest>();
  private stopping = false;

  constructor(private readonly options: CodexClientOptions = {}) {
    super();
  }

  async start(): Promise<void> {
    if (this.proc) {
      return;
    }

    const command = this.options.command ?? DEFAULT_CODEX_BIN;
    const args = this.options.args ?? ["app-server", "--listen", "stdio://"];
    this.stopping = false;
    this.proc = spawn(command, args, {
      cwd: this.options.cwd,
      env: { ...process.env, ...this.options.env },
      stdio: "pipe"
    });

    this.proc.stdout.setEncoding("utf8");
    this.proc.stderr.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk: string) => this.handleStdout(chunk));
    this.proc.stderr.on("data", (chunk: string) => log("codex-app-server", chunk.trimEnd()));
    this.proc.on("exit", (code, signal) => {
      this.proc = null;
      const message = `app-server exited code=${code ?? "null"} signal=${signal ?? "null"}`;
      if (!this.stopping) {
        logError("codex-app-server", message);
      }
      for (const pending of this.pending.values()) {
        pending.reject(new Error(message));
      }
      this.pending.clear();
      this.emit("exit", { code, signal });
    });

    await this.initialize();
  }

  async stop(): Promise<void> {
    if (!this.proc) {
      return;
    }
    this.stopping = true;
    this.proc.kill();
    this.proc = null;
  }

  async createThread(params: {
    cwd?: string;
    approvalPolicy?: "never" | "on-request" | "untrusted";
    sandboxMode?: "read-only" | "workspace-write" | "danger-full-access";
    model?: string;
  } = {}): Promise<ThreadStartResult> {
    const result = await this.request("thread/start", {
      cwd: params.cwd ?? process.cwd(),
      approvalPolicy: params.approvalPolicy ?? DEFAULT_CODEX_APPROVAL_POLICY,
      sandbox: params.sandboxMode ?? DEFAULT_CODEX_SANDBOX_MODE,
      experimentalRawEvents: false,
      persistExtendedHistory: false,
      model: params.model ?? null,
      developerInstructions: WECHAT_BRIDGE_DEVELOPER_INSTRUCTIONS
    });
    return ThreadStartResultSchema.parse(result);
  }

  async startTurn(params: {
    threadId: string;
    text: string;
    cwd?: string;
    localImagePaths?: string[];
  }): Promise<TurnStartResult> {
    const result = await this.request("turn/start", {
      threadId: params.threadId,
      cwd: params.cwd ?? process.cwd(),
      input: [
        {
          type: "text",
          text: params.text,
          text_elements: []
        },
        ...(params.localImagePaths ?? []).map((imagePath) => ({
          type: "localImage",
          path: imagePath
        }))
      ]
    });
    return TurnStartResultSchema.parse(result);
  }

  async steerTurn(params: {
    threadId: string;
    text: string;
    cwd?: string;
    localImagePaths?: string[];
  }): Promise<TurnStartResult> {
    const result = await this.request("turn/steer", {
      threadId: params.threadId,
      cwd: params.cwd ?? process.cwd(),
      input: [
        {
          type: "text",
          text: params.text,
          text_elements: []
        },
        ...(params.localImagePaths ?? []).map((imagePath) => ({
          type: "localImage",
          path: imagePath
        }))
      ]
    });
    return TurnStartResultSchema.parse(result);
  }

  async runTextTurn(params: {
    threadId: string;
    text: string;
    cwd?: string;
    timeoutMs?: number;
    localImagePaths?: string[];
    mode?: RunTurnMode;
  }): Promise<string> {
    const mode = params.mode ?? "start";
    let turn: TurnStartResult;
    if (mode === "steer") {
      turn = await this.steerTurn(params);
    } else if (mode === "prefer-steer") {
      try {
        turn = await this.steerTurn(params);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("thread not found")) {
          throw error;
        }
        log("codex-turn", `steer failed, falling back to start: ${message}`);
        turn = await this.startTurn(params);
      }
    } else {
      turn = await this.startTurn(params);
    }
    const turnId = turn.turn.id;
    const timeoutMs = params.timeoutMs ?? 10 * 60_000;

    return new Promise<string>((resolve, reject) => {
      let text = "";
      let finished = false;

      const cleanup = () => {
        clearTimeout(timer);
        this.off("agentMessageDelta", onDelta);
        this.off("turnCompleted", onCompleted);
      };

      const onDelta = (event: AgentMessageDeltaEvent) => {
        if (event.threadId !== params.threadId || event.turnId !== turnId) {
          return;
        }
        text += event.delta;
      };

      const onCompleted = (event: TurnCompletedEvent) => {
        if (event.threadId !== params.threadId || event.turn.id !== turnId) {
          return;
        }
        finished = true;
        cleanup();
        resolve(text.trim());
      };

      const timer = setTimeout(() => {
        if (finished) {
          return;
        }
        cleanup();
        reject(new Error(`turn ${turnId} timed out`));
      }, timeoutMs);

      this.on("agentMessageDelta", onDelta);
      this.on("turnCompleted", onCompleted);
    });
  }

  private async initialize(): Promise<void> {
    const result = await this.request("initialize", {
      clientInfo: {
        name: "codex-wechat-gateway",
        version: "0.1.0",
        title: "Codex WeChat Gateway"
      },
      capabilities: {
        experimentalApi: false,
        optOutNotificationMethods: []
      }
    });
    InitializeResultSchema.parse(result);
    this.notify("initialized", undefined);
  }

  private request(method: string, params: unknown): Promise<unknown> {
    if (!this.proc) {
      return Promise.reject(new Error("app-server is not running"));
    }
    const id = this.nextId++;
    const message: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc?.stdin.write(JSON.stringify(message) + "\n");
    });
  }

  private notify(method: string, params: unknown): void {
    if (!this.proc) {
      return;
    }
    const message: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params
    };
    this.proc.stdin.write(JSON.stringify(message) + "\n");
  }

  private respond(id: JsonRpcId, result: unknown): void {
    if (!this.proc) {
      return;
    }
    const message: JsonRpcSuccess = {
      jsonrpc: "2.0",
      id,
      result
    };
    this.proc.stdin.write(JSON.stringify(message) + "\n");
  }

  private respondError(id: JsonRpcId | null, code: number, message: string): void {
    if (!this.proc) {
      return;
    }
    const response: JsonRpcFailure = {
      jsonrpc: "2.0",
      id,
      error: { code, message }
    };
    this.proc.stdin.write(JSON.stringify(response) + "\n");
  }

  private handleStdout(chunk: string): void {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        this.handleMessage(line);
      }
      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  private handleMessage(line: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch (error) {
      logError("codex-app-server", `failed to parse JSON-RPC line: ${String(error)}`);
      return;
    }

    const errorResult = JsonRpcErrorSchema.safeParse(parsed);
    if (errorResult.success) {
      const pending = this.pending.get(errorResult.data.id ?? "");
      if (pending) {
        this.pending.delete(errorResult.data.id ?? "");
        pending.reject(new Error(errorResult.data.error.message));
      }
      return;
    }

    const successResult = JsonRpcResultSchema.safeParse(parsed);
    if (successResult.success) {
      const pending = this.pending.get(successResult.data.id);
      if (pending) {
        this.pending.delete(successResult.data.id);
        pending.resolve(successResult.data.result);
      }
      return;
    }

    if ("id" in parsed && "method" in parsed && typeof parsed.method === "string") {
      this.handleServerRequest(parsed.id as JsonRpcId, parsed.method, parsed.params);
      return;
    }

    const notification = JsonRpcNotificationSchema.safeParse(parsed);
    if (!notification.success) {
      return;
    }

    this.emit("notification", notification.data);
    this.handleHighLevelNotification(notification.data);
  }

  private handleHighLevelNotification(
    notification: ReturnType<typeof JsonRpcNotificationSchema.parse>
  ): void {
    if (notification.method === "item/agentMessage/delta") {
      const params = notification.params as {
        threadId?: string;
        turnId?: string;
        delta?: string;
      };
      if (params.threadId && params.turnId && typeof params.delta === "string") {
        this.emit("agentMessageDelta", {
          threadId: params.threadId,
          turnId: params.turnId,
          delta: params.delta
        } satisfies AgentMessageDeltaEvent);
      }
    }

    if (notification.method === "turn/completed") {
      const params = notification.params as TurnCompletedEvent;
      if (params?.threadId && params?.turn?.id) {
        this.emit("turnCompleted", params);
      }
    }
  }

  private handleServerRequest(id: JsonRpcId, method: string, params: unknown): void {
    log("codex-app-server", `server request: ${method}`);

    switch (method) {
      case "item/commandExecution/requestApproval":
        this.respond(id, { decision: "decline" });
        return;

      case "item/fileChange/requestApproval":
        this.respond(id, { decision: "decline" });
        return;

      case "item/tool/requestUserInput": {
        const answers: Record<string, { answers: string[] }> = {};
        const typed = params as { questions?: Array<{ id: string }> };
        for (const question of typed.questions ?? []) {
          answers[question.id] = { answers: [] };
        }
        this.respond(id, { answers });
        return;
      }

      case "mcpServer/elicitation/request":
        this.respond(id, { action: "decline", content: null, _meta: null });
        return;

      case "item/permissions/requestApproval":
        this.respond(id, { permissions: {}, scope: "turn" });
        return;

      case "item/tool/call":
        this.respond(id, {
          success: false,
          contentItems: [
            {
              type: "input_text",
              text: "Dynamic tool calls are not supported by this gateway."
            }
          ]
        });
        return;

      case "account/chatgptAuthTokens/refresh":
        this.respondError(id, -32000, "Token refresh is not supported by this gateway");
        return;

      case "applyPatchApproval":
        this.respond(id, { decision: "denied" });
        return;

      case "execCommandApproval":
        this.respond(id, { decision: "denied" });
        return;

      default:
        this.respondError(id, -32601, `Unsupported server request: ${method}`);
    }
  }
}
