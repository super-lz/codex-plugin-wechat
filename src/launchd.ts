import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { APP_NAME, LOG_DIR } from "./config.js";

export function createLaunchdPlist(params: {
  label?: string;
  programArguments: string[];
  workingDirectory: string;
}): { plistPath: string; plistXml: string } {
  const label = params.label ?? `dev.codex.${APP_NAME}`;
  const launchAgentsDir = join(homedir(), "Library", "LaunchAgents");
  const plistPath = join(launchAgentsDir, `${label}.plist`);
  const stdoutPath = join(LOG_DIR, "gateway.stdout.log");
  const stderrPath = join(LOG_DIR, "gateway.stderr.log");

  mkdirSync(launchAgentsDir, { recursive: true });
  mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });

  const args = params.programArguments
    .map((value) => `    <string>${escapeXml(value)}</string>`)
    .join("\n");

  const plistXml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
    `<plist version="1.0">`,
    `<dict>`,
    `  <key>Label</key>`,
    `  <string>${escapeXml(label)}</string>`,
    `  <key>ProgramArguments</key>`,
    `  <array>`,
    args,
    `  </array>`,
    `  <key>WorkingDirectory</key>`,
    `  <string>${escapeXml(params.workingDirectory)}</string>`,
    `  <key>RunAtLoad</key>`,
    `  <true/>`,
    `  <key>KeepAlive</key>`,
    `  <true/>`,
    `  <key>StandardOutPath</key>`,
    `  <string>${escapeXml(stdoutPath)}</string>`,
    `  <key>StandardErrorPath</key>`,
    `  <string>${escapeXml(stderrPath)}</string>`,
    `</dict>`,
    `</plist>`,
    ``
  ].join("\n");

  writeFileSync(plistPath, plistXml, { mode: 0o644 });
  return { plistPath, plistXml };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}
