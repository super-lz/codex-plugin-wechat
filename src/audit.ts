import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { AUDIT_LOG_FILE } from "./config.js";

export type AuditEvent = {
  kind: string;
  senderId?: string;
  threadId?: string;
  detail?: string;
  ok?: boolean;
};

export function writeAudit(event: AuditEvent): void {
  mkdirSync(dirname(AUDIT_LOG_FILE), { recursive: true, mode: 0o700 });
  appendFileSync(
    AUDIT_LOG_FILE,
    JSON.stringify({
      ts: new Date().toISOString(),
      ...event
    }) + "\n",
    { mode: 0o600 }
  );
}
