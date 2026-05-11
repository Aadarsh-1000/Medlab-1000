const COOKIE_NAME = "medlab_session";
const STATE_COOKIE = "medlab_state";

export function getGoogleConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}

export function getBaseUrl(req) {

  const protocol =
    req.headers["x-forwarded-proto"] || "http";

  return `${protocol}://${req.headers.host}`;
}

function cookieOptions() {

  const isProd =
    process.env.NODE_ENV === "production";

  return [
    "Path=/",
    "HttpOnly",

    // REQUIRED FOR GOOGLE OAUTH ON VERCEL
    isProd ? "Secure" : "",

    // IMPORTANT FIX
    isProd
      ? "SameSite=None"
      : "SameSite=Lax"

  ]
    .filter(Boolean)
    .join("; ");
}

export function createStateCookie(state) {

  return `${STATE_COOKIE}=${state}; ${cookieOptions()}`;
}

export function clearStateCookie() {

  return `${STATE_COOKIE}=; ${cookieOptions()}; Max-Age=0`;
}

export function getState(req) {

  const cookie = req.headers.cookie || "";

  const match =
cookie.match(
  new RegExp(`${STATE_COOKIE}=([^;]+)`)
);
  return match ? match[1] : null;
}

export function createSessionCookie(user) {

  const data = Buffer.from(
    JSON.stringify(user)
  ).toString("base64");

  return `${COOKIE_NAME}=${data}; ${cookieOptions()}`;
}

export function clearSessionCookie() {

  return `${COOKIE_NAME}=; ${cookieOptions()}; Max-Age=0`;
}

export function getSession(req) {

  const cookie = req.headers.cookie || "";

  const match =
  cookie.match(
  new RegExp(`${COOKIE_NAME}=([^;]+)`)
);

  if (!match) return null;

  try {

    return JSON.parse(
      Buffer.from(match[1], "base64").toString()
    );

  } catch {

    return null;
  }
}