// Local dev server: serves the static files and proxies /api/* to mail.tm (which blocks direct browser calls via CORS).
// The password login lives in the page itself (gate.js + config.js), as in Pixelsense.
// On GitHub Pages there is no server, so config.js points apiBase at a Cloudflare Worker instead (see worker.js).
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const UPSTREAM = "https://api.mail.tm";
const FILES = { "/": "index.html", "/index.html": "index.html", "/config.js": "config.js", "/gate.js": "gate.js", "/set-password.html": "set-password.html" };
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

http.createServer(async (req, res) => {
  try {
    const url = req.url.split("?")[0];
    if (url.startsWith("/api/")) {
      const chunks = [];
      let size = 0;
      for await (const c of req) { size += c.length; if (size > 1 << 20) throw Object.assign(new Error("Request too large"), { status: 413 }); chunks.push(c); }
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const headers = {};
      for (const h of ["content-type", "authorization"]) if (req.headers[h]) headers[h] = req.headers[h];
      const up = await fetch(UPSTREAM + req.url.slice(4), { method: req.method, headers, body });
      res.writeHead(up.status, { "content-type": up.headers.get("content-type") || "application/json" });
      res.end(Buffer.from(await up.arrayBuffer()));
    } else if (FILES[url]) {
      res.writeHead(200, { "content-type": TYPES[path.extname(FILES[url])], "cache-control": "no-store" });
      res.end(fs.readFileSync(path.join(__dirname, FILES[url])));
    } else {
      res.writeHead(404); res.end("Not found");
    }
  } catch (e) {
    res.writeHead(e.status || 502, { "content-type": "application/json" });
    res.end(JSON.stringify({ "hydra:description": "Proxy error: " + e.message }));
  }
}).listen(PORT, () => console.log(`TestTickle running at http://localhost:${PORT}`));
