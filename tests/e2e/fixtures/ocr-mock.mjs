// A stand-in for the AI reading API during browser tests (started by playwright.config.ts): it
// answers every forced tool call with a fixed reading, like Anthropic's Messages API would.
import { createServer } from "node:http";

const port = Number(process.env.OCR_MOCK_PORT ?? 4556);

const emptyLine = Object.fromEntries(
  [
    "date",
    "departurePlace",
    "departureTime",
    "arrivalPlace",
    "arrivalTime",
    "aircraftType",
    "registration",
    "seTime",
    "meTime",
    "mpTime",
    "totalTime",
    "picName",
    "landingsDay",
    "landingsNight",
    "nightTime",
    "ifrTime",
    "picTime",
    "copilotTime",
    "dualTime",
    "instructorTime",
    "fstdType",
    "fstdTime",
    "remarks",
  ].map((k) => [k, null]),
);
const emptyTotals = Object.fromEntries(
  [
    "seTime",
    "meTime",
    "mpTime",
    "totalTime",
    "landingsDay",
    "landingsNight",
    "nightTime",
    "ifrTime",
    "picTime",
    "copilotTime",
    "dualTime",
    "instructorTime",
    "fstdTime",
  ].map((k) => [k, null]),
);

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
  // A spread with one unreadable line and a page total that doesn't match the lines (2:40 written,
  // 2:30 read), so the check shows.
  record_logbook_spread: {
    isLogbook: true,
    lines: [
      {
        ...emptyLine,
        line: 1,
        date: "2024-05-12",
        departurePlace: "LBSF",
        departureTime: "08:05",
        arrivalPlace: "LBPD",
        arrivalTime: "09:15",
        aircraftType: "C172",
        registration: "LZ-ABC",
        seTime: "1:10",
        totalTime: "1:10",
        picName: "SELF",
        landingsDay: 1,
        picTime: "1:10",
      },
      { ...emptyLine, line: 2, date: null, departurePlace: "LBPD" },
      {
        ...emptyLine,
        line: 3,
        date: "2024-05-13",
        departurePlace: "LBPD",
        departureTime: "10:00",
        arrivalPlace: "LBSF",
        arrivalTime: "11:20",
        aircraftType: "C172",
        registration: "LZ-ABC",
        seTime: "1:20",
        totalTime: "1:20",
        picName: "SELF",
        landingsDay: 2,
        picTime: "1:20",
      },
      { ...emptyLine, line: 4, date: "2024-05-20", fstdType: "ALSIM AL42", fstdTime: "2:00" },
    ],
    totalThisPage: {
      ...emptyTotals,
      totalTime: "2:40",
      seTime: "2:30",
      landingsDay: 3,
      picTime: "2:30",
      fstdTime: "2:00",
    },
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
