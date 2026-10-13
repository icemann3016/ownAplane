// A stand-in for RAF Aviation's API during browser tests (started by playwright.config.ts, which
// points RAFAVIATION_API_URL here): GET /api/v1/bookings with the key "raf-e2e-key-<REG>" answers
// two bookings in Sofia local time for registration <REG>, three and four days after `from`, and
// one without a registration (the real API covers EC-IDR only and leaves it out) five days after;
// any other key gets 401 like the real API. A registration per key keeps parallel tests apart.
import { createServer } from "node:http";

const port = Number(process.env.RAF_MOCK_PORT ?? 4557);
const KEY = /^Bearer raf-e2e-key-([A-Z0-9]+)$/;

const addDays = (date, days) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname !== "/api/v1/bookings") return send(404, { message: "Not Found" });
  const key = KEY.exec(req.headers.authorization ?? "");
  if (!key) return send(401, { message: "Unauthenticated." });
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to || to < from) return send(422, { message: "The given data was invalid." });
  const registration = key[1];
  send(200, {
    data: [
      { date: addDays(from, 3), from: "10:00", to: "12:00", status: "approved", registration },
      { date: addDays(from, 4), from: "09:00", to: "11:30", status: "pending", registration },
      { date: addDays(from, 5), from: "09:00", to: "10:00", status: "approved" },
    ],
  });
}).listen(port, "127.0.0.1");
