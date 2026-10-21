# TestTickle

Disposable test inboxes (via [mail.tm](https://mail.tm)) with persona labels, a message preview and code/link detection.
A static site with a password gate built into the page, set up like Pixelsense.

## Run locally

```bash
node server.js
```

Open http://localhost:3000. `server.js` serves the files and proxies mail.tm (which blocks direct browser calls).

## Password

1. Open `set-password.html` (e.g. http://localhost:3000/set-password.html), choose a password, copy the line it gives you.
2. Paste it into `config.js` as `passwordHash`. Leave it empty for no login.

Only a salted PBKDF2 hash is stored, never the password. This is a front-door gate, not strong security: the page's code is public, so anyone determined can read it.

## Publish on GitHub Pages

Pages has no server, so the mail.tm proxy runs as a free Cloudflare Worker:

1. Cloudflare dashboard > Workers & Pages > Create > Worker. Paste `worker.js`, deploy.
2. In the Worker settings add the variable `ALLOWED_ORIGIN` = `https://<your-github-username>.github.io`.
3. In `config.js` set `apiBase` to the Worker's URL (e.g. `https://testtickle.<you>.workers.dev`).
4. Repo Settings > Pages > Deploy from branch `main` (the repo must be public on a free GitHub plan).

## Fallback provider

If mail.tm is down when you create an inbox, the app falls back to temp-mail.io (proxied by `server.js` at `/api2`).
The tile's address tooltip shows which provider made it. The same `worker.js` also serves the fallback (at `<worker>/tmio`), so no extra setup on GitHub Pages.
