# TestTickle

Disposable test inboxes (via [mail.tm](https://mail.tm)) with persona labels, a message preview and code/link detection. Login-protected.

## Run

```bash
TT_USER=you TT_PASS='a-long-password' npm start
```

Open http://localhost:3000.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `TT_USER` | Username (default `admin`) |
| `TT_PASS` | Password. If unset, a random one is printed at startup |
| `TT_SECRET` | Long random string used to sign session cookies. If unset, sessions reset on restart |
| `TT_TRUST_PROXY` | Set to `1` behind a reverse proxy (Render, Fly, Railway) |
| `PORT` | Default `3000` |

## Deploying

GitHub Pages will **not** work: the app needs `server.js` to proxy mail.tm (which blocks direct browser calls).
Use a host that runs Node (Render, Fly.io, Railway), set the variables above, and serve over HTTPS.
