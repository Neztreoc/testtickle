// To turn on the password login, open set-password.html, make your password,
// and paste the passwordHash line it gives you below. Leave it empty for no login.
// apiBase: where the mail.tm proxy lives. "/api" works with `node server.js`;
// on GitHub Pages set it to your Cloudflare Worker URL (see worker.js).
window.TESTTICKLE_CONFIG = {
  apiBase: "/api",
  passwordHash: ""
};
