
import crypto from "crypto";
import { createStateCookie, getBaseUrl, getGoogleConfig } from "../_lib/auth.js";

export default async function handler(req, res) {
  const state = crypto.randomBytes(16).toString("hex");
  const { clientId } = getGoogleConfig();
  const redirectUri = `${getBaseUrl(req)}/api/auth/callback`;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  res.setHeader("Set-Cookie", createStateCookie(state));
  res.writeHead(302, { Location: url.toString() });
  res.end();
}

