import { SESSION_MAP_FILE } from "../config.js";
import { readJsonFile, writeJsonFile } from "../state/store.js";

type SessionMap = {
  users: Record<string, string>;
  workspaces: Record<string, string>;
};

function defaultSessionMap(): SessionMap {
  return { users: {}, workspaces: {} };
}

export class SessionManager {
  private state: SessionMap;

  constructor() {
    const state = readJsonFile<Partial<SessionMap>>(SESSION_MAP_FILE, defaultSessionMap());
    this.state = {
      users: state.users ?? {},
      workspaces: state.workspaces ?? {}
    };
  }

  getThreadIdForUser(userId: string): string | null {
    return this.state.users[userId] ?? null;
  }

  setThreadIdForUser(userId: string, threadId: string): void {
    this.state.users[userId] = threadId;
    writeJsonFile(SESSION_MAP_FILE, this.state);
  }

  clearThreadIdForUser(userId: string): void {
    delete this.state.users[userId];
    writeJsonFile(SESSION_MAP_FILE, this.state);
  }

  getWorkspaceOverrideForUser(userId: string): string | null {
    return this.state.workspaces[userId] ?? null;
  }

  setWorkspaceOverrideForUser(userId: string, workspace: string): void {
    this.state.workspaces[userId] = workspace;
    writeJsonFile(SESSION_MAP_FILE, this.state);
  }

  clearWorkspaceOverrideForUser(userId: string): void {
    delete this.state.workspaces[userId];
    writeJsonFile(SESSION_MAP_FILE, this.state);
  }
}
