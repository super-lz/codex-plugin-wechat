import type { WechatInboundMessage } from "./types.js";

const MAX_CHUNK_LIMIT = 2000;

export function extractText(message: WechatInboundMessage): string {
  const parts: string[] = [];
  for (const item of message.item_list ?? []) {
    if (item.type === 1 && item.text_item?.text) {
      parts.push(item.text_item.text);
    }
  }
  return parts.join("\n").trim();
}

export function chunkText(text: string, limit = MAX_CHUNK_LIMIT): string[] {
  if (text.length <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const para = rest.lastIndexOf("\n\n", limit);
    const line = rest.lastIndexOf("\n", limit);
    const space = rest.lastIndexOf(" ", limit);
    const cut = para > limit / 2 ? para : line > limit / 2 ? line : space > 0 ? space : limit;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, "");
  }
  if (rest.length > 0) {
    chunks.push(rest);
  }
  return chunks;
}
