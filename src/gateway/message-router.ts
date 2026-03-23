import { log } from "../logger.js";
import { CodexAppServerClient } from "../codex/app-server-client.js";
import { SessionManager } from "./session-manager.js";
import { getUserWorkspace } from "./workspace.js";

export class MessageRouter {
  constructor(
    private readonly codex: CodexAppServerClient,
    private readonly sessions: SessionManager
  ) {}

  async handleUserText(params: {
    senderId: string;
    text: string;
    localImagePaths?: string[];
  }): Promise<{ reply: string; threadId: string; cwd: string }> {
    const cwd = this.getWorkspaceForUser(params.senderId);
    let threadId = this.sessions.getThreadIdForUser(params.senderId);
    if (!threadId) {
      threadId = await this.createAndStoreThread(params.senderId, cwd);
    }

    let reply: string;
    try {
      reply = await this.codex.runTextTurn({
        threadId,
        text: params.text,
        cwd,
        localImagePaths: params.localImagePaths,
        mode: "prefer-steer"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("thread not found")) {
        throw error;
      }

      log("session-manager", `stale thread ${threadId} for ${params.senderId}; recreating in ${cwd}`);
      threadId = await this.createAndStoreThread(params.senderId, cwd);
      reply = await this.codex.runTextTurn({
        threadId,
        text: params.text,
        cwd,
        localImagePaths: params.localImagePaths,
        mode: "prefer-steer"
      });
    }
    return { reply, threadId, cwd };
  }

  getWorkspaceForUser(senderId: string): string {
    return this.sessions.getWorkspaceOverrideForUser(senderId) ?? getUserWorkspace(senderId);
  }

  private async createAndStoreThread(senderId: string, cwd: string): Promise<string> {
    const thread = await this.codex.createThread({ cwd });
    const threadId = thread.thread.id;
    this.sessions.setThreadIdForUser(senderId, threadId);
    log("session-manager", `created thread ${threadId} for ${senderId} in ${cwd}`);
    return threadId;
  }
}
