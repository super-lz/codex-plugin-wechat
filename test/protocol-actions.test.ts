import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseCodexActions } from "../src/protocol/actions.js";

test("parses image and file send actions and strips the control block", () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-wechat-actions-"));
  const imagePath = join(dir, "out.webp");
  const filePath = join(dir, "report.pdf");
  writeFileSync(imagePath, "image");
  writeFileSync(filePath, "file");

  const parsed = parseCodexActions(`已处理完成。

\`\`\`codex-actions
{
  "send": [
    { "type": "image", "path": "${imagePath}" },
    { "type": "file", "path": "${filePath}" }
  ],
  "control": [
    { "type": "thread.reset" }
  ]
}
\`\`\``);

  assert.equal(parsed.cleanedText, "已处理完成。");
  assert.deepEqual(parsed.sendActions, [
    { type: "image", path: imagePath },
    { type: "file", path: filePath }
  ]);
  assert.deepEqual(parsed.controlActions, [{ type: "thread.reset" }]);
});

test("preserves explicit file actions for image-like files", () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-wechat-actions-"));
  const imagePath = join(dir, "converted.webp");
  writeFileSync(imagePath, "image");

  const parsed = parseCodexActions(`\`\`\`codex-actions
{
  "send": [
    { "type": "file", "path": "${imagePath}" }
  ]
}
\`\`\``);

  assert.deepEqual(parsed.sendActions, [{ type: "file", path: imagePath }]);
  assert.deepEqual(parsed.controlActions, []);
});

test("ignores unreadable and relative paths", () => {
  const parsed = parseCodexActions(`\`\`\`codex-actions
{
  "send": [
    { "type": "image", "path": "relative/out.png" },
    { "type": "file", "path": "/definitely/missing/file.pdf" }
  ],
  "control": [
    { "type": "workspace.set", "path": "relative/path" }
  ]
}
\`\`\``);

  assert.deepEqual(parsed.sendActions, []);
  assert.deepEqual(parsed.controlActions, []);
});

test("parses control actions for workspace changes", () => {
  const parsed = parseCodexActions(`\`\`\`codex-actions
{
  "control": [
    { "type": "workspace.set", "path": "/tmp/project" },
    { "type": "workspace.reset" },
    { "type": "thread.reset" }
  ]
}
\`\`\``);

  assert.deepEqual(parsed.sendActions, []);
  assert.deepEqual(parsed.controlActions, [
    { type: "workspace.set", path: "/tmp/project" },
    { type: "workspace.reset" },
    { type: "thread.reset" }
  ]);
});
