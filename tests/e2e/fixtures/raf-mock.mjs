// A stand-in for RAF Aviation's API during browser tests (started by playwright.config.ts, which
// points RAFAVIATION_API_URL here): GET /api/v1/bookings with the key "raf-e2e-key" answers two
// bookings in Sofia local time, three and four days after `from`, for the `registration` asked
// for (the real API covers EC-IDR only and leaves it out); any other key gets 401 like the real
// API.
import { createServer } from "node:http";

const port = Number(process.env.RAF_MOCK_PORT ?? 4557);
const KEY = "raf-e2e-key";

const addDays = (date, days) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname !== "/api/v1/bookings") return send(404, { message: "Not Found" });
  if (req.headers.authorization !== `Bearer ${KEY}`)
    return send(401, { message: "Unauthenticated." });
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to || to < from) return send(422, { message: "The given data was invalid." });
  const registration = url.searchParams.get("registration") ?? undefined;
  send(200, {
    data: [
      { date: addDays(from, 3), from: "10:00", to: "12:00", status: "approved", registration },
      { date: addDays(from, 4), from: "09:00", to: "11:30", status: "pending", registration },
    ],
  });
}).listen(port, "127.0.0.1");
