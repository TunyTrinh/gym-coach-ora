import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import type { Express, Request, Response } from "express";
import { randomBytes } from "node:crypto";
import { parse as parseCookie } from "cookie";
import { getLocalUserByUsername, getUserByOpenId, listPreviewDebugAccounts, syncVerifiedGoogleUser, updateUserLastSignedIn } from "../db";
import { hasVerifiedGoogleIdentity, isAdminLocalAccount } from "../google-authorization";
import { isValidLocalPassword, isValidLocalUsername, normalizeLocalUsername, verifyLocalPassword } from "../local-credentials";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { isPreviewDebugHost } from "../../lib/preview-debug";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function buildUserResponse(
  user:
    | Awaited<ReturnType<typeof getUserByOpenId>>
    | {
        openId: string;
        name?: string | null;
        email?: string | null;
        loginMethod?: string | null;
        role?: "client" | "coach" | "admin";
        lastSignedIn?: Date | null;
      },
) {
  return {
    id: (user as any)?.id ?? null,
    openId: user?.openId ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    loginMethod: user?.loginMethod ?? null,
    role: (user as any)?.role ?? "client",
    lastSignedIn: (user?.lastSignedIn ?? new Date()).toISOString(),
  };
}

const GOOGLE_STATE_COOKIE = "gymflow_google_oauth_state";
const GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;
const LOCAL_LOGIN_WINDOW_MS = 60_000;
const LOCAL_LOGIN_MAX_ATTEMPTS = 5;
const localLoginAttempts = new Map<string, { count: number; resetAt: number }>();
const PREVIEW_DEBUG_COOKIE = "coachora_preview_debug_admin";
const PREVIEW_DEBUG_TTL_MS = 30 * 60 * 1000;

function googleIsConfigured() {
  return Boolean(ENV.googleClientId && ENV.googleClientSecret && (ENV.googleRedirectUri || ENV.appBaseUrl));
}

function googleRedirectUri() {
  return ENV.googleRedirectUri || `${ENV.appBaseUrl.replace(/\/$/, "")}/api/auth/google/callback`;
}

function selfHostedFrontendUrl() {
  return ENV.appBaseUrl || process.env.EXPO_WEB_PREVIEW_URL || process.env.EXPO_PACKAGER_PROXY_URL || "http://localhost:8081";
}

function googleStateCookieOptions(req: Request) {
  return { ...getSessionCookieOptions(req), sameSite: "lax" as const, maxAge: GOOGLE_STATE_TTL_MS };
}

function localLoginRateLimitAllows(req: Request) {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const current = localLoginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    localLoginAttempts.set(key, { count: 1, resetAt: now + LOCAL_LOGIN_WINDOW_MS });
    return true;
  }
  if (current.count >= LOCAL_LOGIN_MAX_ATTEMPTS) return false;
  current.count += 1;
  return true;
}

function clearLocalLoginRateLimit(req: Request) {
  localLoginAttempts.delete(req.ip || req.socket.remoteAddress || "unknown");
}

function isManagedPreviewRequest(req: Request) {
  return isPreviewDebugHost(process.env.NODE_ENV !== "production", req.hostname);
}

function previewDebugCookieOptions(req: Request) {
  return { ...getSessionCookieOptions(req), sameSite: "lax" as const, maxAge: PREVIEW_DEBUG_TTL_MS };
}

async function requirePreviewDebugAdmin(req: Request, res: Response) {
  if (!isManagedPreviewRequest(req)) {
    res.status(404).json({ error: "Preview debug tools are unavailable." });
    return null;
  }

  try {
    const debugToken = parseCookie(req.headers.cookie ?? "")[PREVIEW_DEBUG_COOKIE];
    const debugSession = await sdk.verifySession(debugToken);
    const authenticated = debugSession ? null : await sdk.authenticateRequest(req);
    const actor = await getUserByOpenId(debugSession?.openId ?? authenticated?.openId ?? "");
    if (!actor || actor.role !== "admin") {
      res.status(403).json({ error: "An authenticated admin is required for Preview account switching." });
      return null;
    }

    if (!debugSession) {
      const controlToken = await sdk.createSessionToken(actor.openId, { name: actor.name || "Coachora Administrator", expiresInMs: PREVIEW_DEBUG_TTL_MS });
      res.cookie(PREVIEW_DEBUG_COOKIE, controlToken, previewDebugCookieOptions(req));
    }
    return actor;
  } catch {
    res.status(403).json({ error: "An authenticated admin is required for Preview account switching." });
    return null;
  }
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/debug/accounts", async (req: Request, res: Response) => {
    const actor = await requirePreviewDebugAdmin(req, res);
    if (!actor) return;
    const accounts = await listPreviewDebugAccounts();
    res.json({ actor: buildUserResponse(actor), accounts: accounts.map(buildUserResponse) });
  });

  app.post("/api/debug/switch-account", async (req: Request, res: Response) => {
    const actor = await requirePreviewDebugAdmin(req, res);
    if (!actor) return;
    const accountId = typeof req.body?.accountId === "number" ? req.body.accountId : Number(req.body?.accountId);
    if (!Number.isInteger(accountId) || accountId <= 0) {
      res.status(400).json({ error: "Choose a valid account." });
      return;
    }
    const target = (await listPreviewDebugAccounts()).find((account) => account.id === accountId);
    if (!target) {
      res.status(404).json({ error: "The selected account no longer exists." });
      return;
    }
    const sessionToken = await sdk.createSessionToken(target.openId, { name: target.name || "Coachora member", expiresInMs: PREVIEW_DEBUG_TTL_MS });
    res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: PREVIEW_DEBUG_TTL_MS });
    res.json({ user: buildUserResponse(target), expiresInMs: PREVIEW_DEBUG_TTL_MS });
  });

  app.post("/api/debug/exit", async (req: Request, res: Response) => {
    if (!isManagedPreviewRequest(req)) {
      res.status(404).json({ error: "Preview debug tools are unavailable." });
      return;
    }
    res.clearCookie(PREVIEW_DEBUG_COOKIE, { ...previewDebugCookieOptions(req), maxAge: -1 });
    res.json({ success: true });
  });

  app.post("/api/auth/local/login", async (req: Request, res: Response) => {
    if (!localLoginRateLimitAllows(req)) {
      res.status(429).json({ error: "Too many sign-in attempts. Please wait a minute." });
      return;
    }

    const rawUsername = typeof req.body?.username === "string" ? req.body.username : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const username = normalizeLocalUsername(rawUsername);
    const invalidCredentials = () => res.status(401).json({ error: "Username or password is incorrect." });

    if (!isValidLocalUsername(username) || !isValidLocalPassword(password)) {
      invalidCredentials();
      return;
    }

    try {
      const user = await getLocalUserByUsername(username);
      const passwordHash = user?.passwordHash;
      const validPassword = passwordHash ? await verifyLocalPassword(password, passwordHash) : false;
      if (!user || !validPassword || !isAdminLocalAccount(user)) {
        invalidCredentials();
        return;
      }

      await updateUserLastSignedIn(user.id);
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "Coachora member",
        expiresInMs: ONE_YEAR_MS,
      });
      clearLocalLoginRateLimit(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.json({ app_session_id: sessionToken, user: buildUserResponse({ ...user, lastSignedIn: new Date() }) });
    } catch (error) {
      console.error("[Local auth] Sign-in failed", error);
      res.status(503).json({ error: "Sign-in is temporarily unavailable. Please try again." });
    }
  });

  app.get("/api/auth/google", (req: Request, res: Response) => {
    if (!googleIsConfigured()) {
      res.status(503).json({ error: "Google sign-in has not been configured on this server." });
      return;
    }
    const state = randomBytes(32).toString("base64url");
    res.cookie(GOOGLE_STATE_COOKIE, state, googleStateCookieOptions(req));
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.search = new URLSearchParams({
      client_id: ENV.googleClientId,
      redirect_uri: googleRedirectUri(),
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    }).toString();
    res.redirect(302, authorizationUrl.toString());
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    const storedState = parseCookie(req.headers.cookie ?? "")[GOOGLE_STATE_COOKIE];
    if (!googleIsConfigured() || !code || !state || !storedState || state !== storedState) {
      res.status(400).json({ error: "Google sign-in could not be verified. Please start again." });
      return;
    }
    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: ENV.googleClientId,
          client_secret: ENV.googleClientSecret,
          redirect_uri: googleRedirectUri(),
          grant_type: "authorization_code",
        }),
      });
      if (!tokenResponse.ok) throw new Error("Google token exchange failed");
      const token = await tokenResponse.json() as { access_token?: string };
      if (!token.access_token) throw new Error("Google access token missing");
      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (!profileResponse.ok) throw new Error("Google profile request failed");
      const profile = await profileResponse.json() as { sub?: string; name?: string; email?: string; email_verified?: boolean };
      if (!hasVerifiedGoogleIdentity(profile)) {
        res.status(403).json({ error: "A verified Google email is required to sign in." });
        return;
      }
      const user = await syncVerifiedGoogleUser({ openId: `google:${profile.sub}`, name: profile.name ?? null, email: profile.email });
      const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || "GymFlow member", expiresInMs: ONE_YEAR_MS });
      res.clearCookie(GOOGLE_STATE_COOKIE, googleStateCookieOptions(req));
      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.redirect(302, selfHostedFrontendUrl());
    } catch (error) {
      console.error("[Google OAuth] Callback failed", error);
      res.status(500).json({ error: "Google sign-in failed. Please try again." });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    res.status(410).json({ error: "This sign-in route is unavailable. Use Google Sign-In." });
  });

  app.get("/api/oauth/mobile", async (req: Request, res: Response) => {
    res.status(410).json({ error: "This sign-in route is unavailable. Use Google Sign-In." });
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  // Get current authenticated user - works with both cookie (web) and Bearer token (mobile)
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      res.json({ user: buildUserResponse(user) });
    } catch {
      res.status(401).json({ error: "Not authenticated", user: null });
    }
  });

  // Establish session cookie from Bearer token
  // Used by iframe preview: frontend receives token via postMessage, then calls this endpoint
  // to get a proper Set-Cookie response from the backend (3000-xxx domain)
  app.post("/api/auth/session", async (req: Request, res: Response) => {
    try {
      // Authenticate using Bearer token from Authorization header
      const user = await sdk.authenticateRequest(req);

      // Get the token from the Authorization header to set as cookie
      const authHeader = req.headers.authorization || req.headers.Authorization;
      if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
        res.status(400).json({ error: "Bearer token required" });
        return;
      }
      const token = authHeader.slice("Bearer ".length).trim();

      // Set cookie for this domain (3000-xxx)
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ success: true, user: buildUserResponse(user) });
    } catch (error) {
      console.error("[Auth] /api/auth/session failed:", error);
      res.status(401).json({ error: "Invalid token" });
    }
  });
}
