import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function ensureParentDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFile(filePath: string, value: unknown): void {
  ensureParentDir(filePath);
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, filePath);
}

export function readTextFile(filePath: string, fallback = ""): string {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return fallback;
  }
}

export function writeTextFile(filePath: string, value: string): void {
  ensureParentDir(filePath);
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, value, { mode: 0o600 });
  renameSync(tmp, filePath);
}
