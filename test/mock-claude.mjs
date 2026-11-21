// Stand-in for api.anthropic.com used only for local testing. Speaks the Messages SSE format.
import http from "node:http"; import fs from "node:fs";
const ev = (res, type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    const b = JSON.parse(body); fs.appendFileSync("/tmp/mock-requests.jsonl", JSON.stringify({ headers: { key: req.headers["x-api-key"], version: req.headers["anthropic-version"] }, body: b }) + "\n");
    const last = b.messages[b.messages.length - 1];
    const wantsTool = typeof last.content === "string" && /december 25/i.test(last.content);
    if (/FAIL/.test(JSON.stringify(last.content))) { res.writeHead(529, { "content-type": "application/json" }); return res.end('{"type":"error","error":{"type":"overloaded_error"}}'); }
    res.writeHead(200, { "content-type": "text/event-stream" });
    ev(res, "message_start", { message: { id: "msg_1", role: "assistant", content: [] } });
    if (wantsTool) {
      ev(res, "content_block_start", { index: 0, content_block: { type: "text", text: "" } });
      ev(res, "content_block_delta", { index: 0, delta: { type: "text_delta", text: "Let me check that date." } });
      ev(res, "content_block_stop", { index: 0 });
      ev(res, "content_block_start", { index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "cards_on_date", input: {} } });
      ev(res, "content_block_delta", { index: 1, delta: { type: "input_json_delta", partial_json: '{"date": "2026' } });
      ev(res, "content_block_delta", { index: 1, delta: { type: "input_json_delta", partial_json: '-12-25"}' } });
      ev(res, "content_block_stop", { index: 1 });
      ev(res, "message_delta", { delta: { stop_reason: "tool_use" } });
    } else {
      const toolResult = Array.isArray(last.content) ? JSON.parse(last.content[0].content).daily.birth.slice(0, 24) : null;
      const text = toolResult ? `On Dec 25 your card is **${toolResult}**.` : `Mock answer to: ${String(last.content).slice(-60)}`;
      ev(res, "content_block_start", { index: 0, content_block: { type: "text", text: "" } });
      for (const part of text.match(/.{1,12}/g)) ev(res, "content_block_delta", { index: 0, delta: { type: "text_delta", text: part } });
      ev(res, "content_block_stop", { index: 0 });
      ev(res, "message_delta", { delta: { stop_reason: "end_turn" } });
    }
    ev(res, "message_stop", {}); res.end();
  });
}).listen(8788, "127.0.0.1");
