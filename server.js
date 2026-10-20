// Serves index.html behind a login and proxies /api/* to mail.tm (which blocks direct browser calls via CORS).
//
// Config (environment variables):
//   TT_USER         login username            (default: admin)
//   TT_PASS         login password            (if unset, a random one is generated and printed at startup)
//   TT_SECRET       cookie-signing secret     (if unset, random per start, so everyone is logged out on restart)
//   TT_TRUST_PROXY  set to 1 behind a reverse proxy (Render, Fly, nginx) to use X-Forwarded-For / -Proto
//   PORT            default 3000
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const UPSTREAM = "https://api.mail.tm";
const USER = process.env.TT_USER || "admin";
let PASS = process.env.TT_PASS, generated = false;
if (!PASS) { PASS = crypto.randomBytes(9).toString("base64url"); generated = true; }
const SECRET = process.env.TT_SECRET || crypto.randomBytes(32).toString("hex");
const TRUST = process.env.TT_TRUST_PROXY === "1";
const SESSION_MS = 7 * 24 * 3600 * 1000;
const MAX_FAILS = 5, LOCK_MS = 15 * 60 * 1000;

const sha = s => crypto.createHash("sha256").update(s).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const sign = s => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");

function makeSession() { const exp = Date.now() + SESSION_MS; return `${exp}.${sign(String(exp))}`; }
function validSession(req) {
  const m = /(?:^|;\s*)tt_session=([^;]+)/.exec(req.headers.cookie || "");
  if (!m) return false;
  const [exp, sig] = m[1].split(".");
  return !!sig && Number(exp) > Date.now() && same(sig, sign(exp));
}
const secure = req => TRUST ? req.headers["x-forwarded-proto"] === "https" : false;
function cookie(req, value, maxAge) {
  return `tt_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure(req) ? "; Secure" : ""}`;
}
const clientIp = req => (TRUST && req.headers["x-forwarded-for"]?.split(",")[0].trim()) || req.socket.remoteAddress;

const fails = new Map(); // ip -> {n, until}
function locked(ip) { const f = fails.get(ip); return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 60000) : 0; }
function noteFail(ip) {
  const f = fails.get(ip) || { n: 0, until: 0 };
  if (f.until && f.until <= Date.now()) { f.n = 0; f.until = 0; }
  if (++f.n >= MAX_FAILS) f.until = Date.now() + LOCK_MS;
  fails.set(ip, f);
}

async function readBody(req, limit) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error("Body too large"), { status: 413 }); chunks.push(c); }
  return Buffer.concat(chunks);
}

const SEC_HEADERS = {
  "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "no-referrer",
  "cache-control": "no-store",
};

function loginPage(error) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in · TestTickle</title><style>
:root{--bg:#f5f6fa;--card:#fff;--line:#e3e6ef;--text:#0f172a;--dim:#516078;--accent:#2563eb;--err:#dc2626}
@media(prefers-color-scheme:dark){:root{--bg:#0b1020;--card:#141a2e;--line:#26304f;--text:#e8ecf8;--dim:#8e9bbd;--accent:#5b8cff}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px}
form{width:min(380px,100%);background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px}
.logo{display:flex;align-items:center;gap:10px;font-size:22px;font-weight:700;margin-bottom:4px}
.logo i{width:36px;height:36px;border-radius:9px;background:#4f7cff;display:grid;place-items:center}
p{margin:0 0 18px;color:var(--dim)}label{display:block;font-weight:600;margin:12px 0 4px;font-size:14px}
input{width:100%;font:inherit;font-size:16px;padding:10px 12px;color:var(--text);background:var(--bg);border:1px solid var(--line);border-radius:8px}
input:focus{outline:2px solid var(--accent);border-color:transparent}
button{width:100%;margin-top:20px;font:inherit;font-weight:600;font-size:16px;padding:12px;border:0;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer}
.err{margin-top:14px;color:var(--err);font-size:14px}
</style></head><body>
<form method="post" action="/login">
<div class="logo"><i><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg></i>TestTickle</div>
<p>Sign in to your test inboxes.</p>
<label for="u">Username</label><input id="u" name="username" autocomplete="username" required autofocus>
<label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Sign in</button>
${error ? `<div class="err" role="alert">${esc(error)}</div>` : ""}
</form></body></html>`;
}

http.createServer(async (req, res) => {
  const send = (status, type, body, extra = {}) => { res.writeHead(status, { "content-type": type, ...SEC_HEADERS, ...extra }); res.end(body); };
  const url = req.url.split("?")[0];
  try {
    if (url === "/login") {
      if (req.method === "GET") return validSession(req) ? send(302, "text/plain", "", { location: "/" }) : send(200, "text/html; charset=utf-8", loginPage());
      if (req.method === "POST") {
        const ip = clientIp(req), wait = locked(ip);
        if (wait) return send(429, "text/html; charset=utf-8", loginPage(`Too many attempts. Try again in ${wait} minute${wait === 1 ? "" : "s"}.`));
        const f = new URLSearchParams((await readBody(req, 4096)).toString());
        const ok = same(f.get("username") || "", USER) & same(f.get("password") || "", PASS); // & (not &&) so both always compared
        if (!ok) { noteFail(ip); return send(401, "text/html; charset=utf-8", loginPage("Wrong username or password.")); }
        fails.delete(ip);
        return send(302, "text/plain", "", { location: "/", "set-cookie": cookie(req, makeSession(), SESSION_MS / 1000) });
      }
    }
    if (url === "/logout" && req.method === "POST") return send(302, "text/plain", "", { location: "/login", "set-cookie": cookie(req, "", 0) });

    if (!validSession(req)) {
      return url.startsWith("/api/")
        ? send(401, "application/json", JSON.stringify({ "hydra:description": "Not signed in" }))
        : send(302, "text/plain", "", { location: "/login" });
    }

    if (url.startsWith("/api/")) {
      const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req, 1 << 20);
      const headers = {};
      for (const h of ["content-type", "authorization"]) if (req.headers[h]) headers[h] = req.headers[h];
      const up = await fetch(UPSTREAM + req.url.slice(4), { method: req.method, headers, body: body?.length ? body : undefined });
      return send(up.status, up.headers.get("content-type") || "application/json", Buffer.from(await up.arrayBuffer()));
    }
    send(200, "text/html; charset=utf-8", fs.readFileSync(path.join(__dirname, "index.html")));
  } catch (e) {
    send(e.status || 502, "application/json", JSON.stringify({ "hydra:description": e.status === 413 ? "Request too large" : "Proxy error: " + e.message }));
  }
}).listen(PORT, () => {
  console.log(`TestTickle running at http://localhost:${PORT}`);
  if (generated) console.log(`No TT_PASS set. Login for this run: ${USER} / ${PASS}`);
});
