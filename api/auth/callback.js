import {
  clearStateCookie,
  createSessionCookie,
  getBaseUrl,
  getGoogleConfig,
  getState,
} from "../_lib/auth.js";

export default async function handler(req, res) {
  const expectedState = getState(req);
  const { state, code } = req.query;

  if (!code || !state || state !== expectedState) {
    res.setHeader("Set-Cookie", clearStateCookie());
    res.writeHead(302, { Location: "/?auth=failed" });
    res.end();
    return;
  }

  try {
    const { clientId, clientSecret } = getGoogleConfig();
    const redirectUri = `${getBaseUrl(req)}/api/auth/callback`;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error(tokenData.error || "Unable to exchange Google auth code.");
    }

    const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const user = await userResponse.json();
    if (!userResponse.ok || !user.sub) {
      throw new Error("Unable to load Google profile.");
    }

    const sessionUser = {
      id: user.sub,
      email: user.email || "",
      name: user.name || user.given_name || "User",
      given_name: user.given_name || "",
      picture: user.picture || "",
    };

    res.setHeader("Set-Cookie", [clearStateCookie(), createSessionCookie(sessionUser)]);
    res.writeHead(302, { Location: "/" });
    res.end();
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.setHeader("Set-Cookie", clearStateCookie());
    res.writeHead(302, { Location: "/?auth=failed" });
    res.end();
  }
}


