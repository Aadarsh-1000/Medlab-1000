import crypto from "crypto";

      const SESSION_COOKIE = "medlab_session";
const STATE_COOKIE = "medlab_oauth_state";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const STATE_TTL_SECONDS = 60 * 10;
  
function base64url(input) {
    return Buffer.from(input)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function unbase64url(input) {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    return Buffer.from(normalized + padding, "base64").toString("utf8");
}

function getSessionSecret() {
    return (
        process.env.SESSION_SECRET ||
        process.env.GITHUB_CLIENT_SECRET ||
        "medlab-vercel-session-secret"
    );
}

function signValue(value) {
    return crypto
        .createHmac("sha256", getSessionSecret())
        .update(value)
        .digest("hex");
}

function encodePayload(payload) {
    const body = base64url(JSON.stringify(payload));
    const signature = signValue(body);
    return `${body}.${signature}`;
}

function decodePayload(value) {
    if (!value || !value.includes(".")) return null;
    const [body, signature] = value.split(".");
    if (!body || !signature) return null;
    if (signValue(body) !== signature) return null;

    try {
        const payload = JSON.parse(unbase64url(body));
        if (payload.exp && Date.now() > payload.exp) return null;
        return payload;
    } catch {
        return null;
    }
}

export function getBaseUrl(req) {
    if (process.env.APP_BASE_URL) {
        return process.env.APP_BASE_URL.replace(/\/$/, "");
    }

    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    return `${proto}://${host}`;
}

export function parseCookies(req) {
    const raw = req.headers.cookie || "";
    return Object.fromEntries(
        raw
            .split(";")
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => {
                const index = part.indexOf("=");
                return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
            }),
    );
}

function serializeCookie(name, value, maxAgeSeconds) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function createSessionCookie(user) {
    const payload = {
        ...user,
        exp: Date.now() + SESSION_TTL_SECONDS * 1000,
    };
    return serializeCookie(SESSION_COOKIE, encodePayload(payload), SESSION_TTL_SECONDS);
}

export function clearSessionCookie() {
    return serializeCookie(SESSION_COOKIE, "", 0);
}

export function getSession(req) {
    const cookies = parseCookies(req);
    return decodePayload(cookies[SESSION_COOKIE]);
}

export function createStateCookie(state) {
    const payload = {
        state,
        exp: Date.now() + STATE_TTL_SECONDS * 1000,
    };
    return serializeCookie(STATE_COOKIE, encodePayload(payload), STATE_TTL_SECONDS);
}

export function clearStateCookie() {
    return serializeCookie(STATE_COOKIE, "", 0);
}

export function getState(req) {
    const cookies = parseCookies(req);
    const payload = decodePayload(cookies[STATE_COOKIE]);
    return payload?.state || null;
}

export function getGoogleConfig() {
    return {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET

    };
}
