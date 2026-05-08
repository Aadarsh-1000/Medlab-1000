import { clearSessionCookie } from "../../../medlabAI/api/_lib/auth.js";

export default function handler(req, res) {
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.writeHead(302, { Location: "/" });
  res.end();
}

