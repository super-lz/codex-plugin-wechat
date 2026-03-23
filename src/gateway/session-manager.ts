import { SESSION_MAP_FILE } from "../config.js";
import { readJsonFile, writeJsonFile } from "../state/store.js";

type SessionMap = {
  users: Record<string, string>;
};

function defaultSessionMap(): SessionMap {
  return { users: {} };
}

export class SessionManager {
  private state: SessionMap;

  constructor() {
    this.state = readJsonFile<SessionMap>(SESSION_MAP_FILE, defaultSessionMap());
  }

  getThreadIdForUser(userId: string): string | null {
    return this.state.users[userId] ?? null;
  }

  setThreadIdForUser(userId: string, threadId: string): void {
    this.state.users[userId] = threadId;
    writeJsonFile(SESSION_MAP_FILE, this.state);
  }
}
