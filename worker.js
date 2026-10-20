// Cloudflare Worker: CORS proxy for mail.tm (which blocks direct browser calls).
// Deploy at dash.cloudflare.com > Workers & Pages > Create > Worker, paste this file,
// then add a variable ALLOWED_ORIGIN = https://<your-github-username>.github.io
// Put the worker's URL in config.js as apiBase.
export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "";
    const cors = {
      "Access-Control-Allow-Origin": origin === allowed ? origin : "null",
      "Access-Control-Allow-Headers": "content-type, authorization",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Vary": "Origin",
    };
    if (origin !== allowed) return new Response("Forbidden", { status: 403, headers: cors });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    const headers = new Headers();
    for (const h of ["content-type", "authorization"]) if (req.headers.has(h)) headers.set(h, req.headers.get(h));
    const up = await fetch("https://api.mail.tm" + url.pathname + url.search, {
      method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(),
    });
    const out = new Headers(cors);
    out.set("content-type", up.headers.get("content-type") || "application/json");
    return new Response(up.status === 204 ? null : up.body, { status: up.status, headers: out });
  },
};
