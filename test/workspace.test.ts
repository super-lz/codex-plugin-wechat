import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeSenderId } from "../src/gateway/workspace.js";

test("sanitizeSenderId keeps safe characters and normalizes separators", () => {
  assert.equal(
    sanitizeSenderId("o9cq80ywgNRnYvRJEDHSuyBbq-Aw@im.wechat"),
    "o9cq80ywgNRnYvRJEDHSuyBbq-Aw-im.wechat"
  );
});

test("sanitizeSenderId falls back to user for empty-like values", () => {
  assert.equal(sanitizeSenderId("////"), "user");
});
