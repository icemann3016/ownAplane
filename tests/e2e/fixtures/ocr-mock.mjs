// A stand-in for the AI reading API during browser tests (started by playwright.config.ts): it
// answers every forced tool call with a fixed reading, like Anthropic's Messages API would.
import { createServer } from "node:http";

const port = Number(process.env.OCR_MOCK_PORT ?? 4556);

const answers = {
  record_licence: {
    isLicence: true,
    type: "ppl_a",
    issuingState: "BG",
    number: "BG.FCL.PPL.0042",
    issuedOn: "2019-05-14",
    expiresOn: null,
    ratings: [
      { kind: "class", code: "SEP (land)", expiresOn: "2027-05-31" },
      { kind: "privilege", code: "Night", expiresOn: null },
    ],
  },
  record_medical: {
    isMedical: true,
    issuingState: "bg",
    classes: [
      { class: "class1", validUntil: "2020-01-31" },
      { class: "class2", validUntil: "2030-06-30" },
    ],
  },
};

createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (!req.headers["x-api-key"] || !req.headers["anthropic-version"]) {
      return send(401, { type: "error", error: { type: "authentication_error" } });
    }
    const body = JSON.parse(raw || "{}");
    const tool = body.tool_choice?.name;
    const input = typeof answers[tool] === "function" ? answers[tool](body) : answers[tool];
    if (!input) return send(400, { type: "error", error: { type: "invalid_request_error" } });
    send(200, {
      id: "msg_test",
      type: "message",
      role: "assistant",
      content: [{ type: "tool_use", id: "toolu_test", name: tool, input }],
      stop_reason: "tool_use",
      usage: { input_tokens: 1000, output_tokens: 100 },
    });
  });
}).listen(port, "127.0.0.1");
