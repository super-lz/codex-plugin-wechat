import { randomBytes } from "node:crypto";

import { WECHAT_ACCESS_FILE } from "../config.js";
import { readJsonFile, writeJsonFile } from "../state/store.js";

export type PendingPairing = {
  senderId: string;
  createdAt: number;
  expiresAt: number;
  replies: number;
};

export type AccessState = {
  dmPolicy: "pairing" | "allowlist" | "disabled";
  allowFrom: string[];
  pending: Record<string, PendingPairing>;
};

type GateResult =
  | { action: "deliver" }
  | { action: "drop" }
  | { action: "pair"; code: string; isResend: boolean };

const MAX_PENDING = 10;
const PAIR_TTL_MS = 60 * 60 * 1000;

function defaultAccessState(): AccessState {
  return {
    dmPolicy: "pairing",
    allowFrom: [],
    pending: {}
  };
}

export function loadAccessState(): AccessState {
  const state = readJsonFile<AccessState>(WECHAT_ACCESS_FILE, defaultAccessState());
  return {
    dmPolicy: state.dmPolicy ?? "pairing",
    allowFrom: state.allowFrom ?? [],
    pending: state.pending ?? {}
  };
}

export function saveAccessState(state: AccessState): void {
  writeJsonFile(WECHAT_ACCESS_FILE, state);
}

export function getAccessStatus(): AccessState {
  const state = loadAccessState();
  if (pruneExpired(state)) {
    saveAccessState(state);
  }
  return state;
}

export function allowSender(senderId: string): void {
  const state = loadAccessState();
  pruneExpired(state);
  if (!state.allowFrom.includes(senderId)) {
    state.allowFrom.push(senderId);
  }
  for (const [code, entry] of Object.entries(state.pending)) {
    if (entry.senderId === senderId) {
      delete state.pending[code];
    }
  }
  saveAccessState(state);
}

export function removeSender(senderId: string): void {
  const state = loadAccessState();
  state.allowFrom = state.allowFrom.filter((value) => value !== senderId);
  saveAccessState(state);
}

export function setPolicy(policy: AccessState["dmPolicy"]): void {
  const state = loadAccessState();
  state.dmPolicy = policy;
  saveAccessState(state);
}

export function approvePairing(code: string): string | null {
  const state = loadAccessState();
  pruneExpired(state);
  const entry = state.pending[code];
  if (!entry) {
    saveAccessState(state);
    return null;
  }
  if (!state.allowFrom.includes(entry.senderId)) {
    state.allowFrom.push(entry.senderId);
  }
  delete state.pending[code];
  saveAccessState(state);
  return entry.senderId;
}

export function denyPairing(code: string): boolean {
  const state = loadAccessState();
  if (!state.pending[code]) {
    return false;
  }
  delete state.pending[code];
  saveAccessState(state);
  return true;
}

export function formatAccessStatus(now = Date.now()): string {
  const state = getAccessStatus();
  const lines = [`policy: ${state.dmPolicy}`, `allowed: ${state.allowFrom.length}`];

  for (const senderId of state.allowFrom) {
    lines.push(`  - ${senderId}`);
  }

  const pendingEntries = Object.entries(state.pending);
  lines.push(`pending: ${pendingEntries.length}`);
  for (const [code, entry] of pendingEntries) {
    const ageMinutes = Math.max(0, Math.floor((now - entry.createdAt) / 60_000));
    const expiresMinutes = Math.max(0, Math.floor((entry.expiresAt - now) / 60_000));
    lines.push(
      `  - ${code} sender=${entry.senderId} age=${ageMinutes}m expires_in=${expiresMinutes}m replies=${entry.replies}`
    );
  }

  return lines.join("\n");
}

export function gateSender(senderId: string): GateResult {
  const state = loadAccessState();
  const changed = pruneExpired(state);

  if (!senderId) {
    if (changed) {
      saveAccessState(state);
    }
    return { action: "drop" };
  }

  if (state.dmPolicy === "disabled") {
    if (changed) {
      saveAccessState(state);
    }
    return { action: "drop" };
  }

  if (state.allowFrom.includes(senderId)) {
    if (changed) {
      saveAccessState(state);
    }
    return { action: "deliver" };
  }

  if (state.dmPolicy === "allowlist") {
    if (changed) {
      saveAccessState(state);
    }
    return { action: "drop" };
  }

  for (const [code, entry] of Object.entries(state.pending)) {
    if (entry.senderId === senderId) {
      entry.replies += 1;
      saveAccessState(state);
      return { action: "pair", code, isResend: true };
    }
  }

  if (Object.keys(state.pending).length >= MAX_PENDING) {
    if (changed) {
      saveAccessState(state);
    }
    return { action: "drop" };
  }

  const code = randomBytes(3).toString("hex");
  const now = Date.now();
  state.pending[code] = {
    senderId,
    createdAt: now,
    expiresAt: now + PAIR_TTL_MS,
    replies: 1
  };
  saveAccessState(state);
  return { action: "pair", code, isResend: false };
}

function pruneExpired(state: AccessState): boolean {
  let changed = false;
  const now = Date.now();
  for (const [code, entry] of Object.entries(state.pending)) {
    if (entry.expiresAt < now) {
      delete state.pending[code];
      changed = true;
    }
  }
  return changed;
}
