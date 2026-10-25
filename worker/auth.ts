import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { users, sessions, type User, type UserRow } from "@shared/schema";
import type { AppEnv, Db, UserEnv } from "./index";

const SESSION_COOKIE = "wset_session";
const COOKIE_PATH = "/wset-training";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, extended while in use
const PBKDF2_ITERATIONS = 100_000; // The most Workers allows

const encoder = new TextEncoder();

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

// Stored as pbkdf2$<iterations>$<salt>$<hash>
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, expected] = stored.split("$");
  if (scheme !== "pbkdf2" || !salt || !expected) return false;
  const actual = new Uint8Array(await pbkdf2(password, fromBase64(salt), Number(iterations)));
  const wanted = fromBase64(expected);
  if (actual.length !== wanted.length) return false;
  return crypto.subtle.timingSafeEqual(actual, wanted);
}

async function sha256(text: string): Promise<string> {
  return toBase64(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

export function isAdminEmail(env: Env, email: string): boolean {
  return env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).includes(email.toLowerCase());
}

export function publicUser({ passwordHash: _, ...user }: UserRow): User {
  return user;
}

function setSessionCookie(c: Context<AppEnv>, token: string, expiresAt: Date) {
  setCookie(c, SESSION_COOKIE, token, {
    path: COOKIE_PATH,
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:", // Plain http only in local dev
    sameSite: "Lax",
    expires: expiresAt,
  });
}

export async function startSession(c: Context<AppEnv>, userId: string) {
  const token = toBase64(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await c.var.db.insert(sessions).values({ id: await sha256(token), userId, expiresAt });
  setSessionCookie(c, token, expiresAt);
}

export async function endSession(c: Context<AppEnv>) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.var.db.delete(sessions).where(eq(sessions.id, await sha256(token)));
  deleteCookie(c, SESSION_COOKIE, { path: COOKIE_PATH });
}

// The logged-in user for this request, or null
async function sessionUser(c: Context<AppEnv>, db: Db): Promise<UserRow | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const id = await sha256(token);
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id));
  if (!row) return null;

  const now = Date.now();
  if (row.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  // Slide the expiry forward once a session is half used, rather than on every request
  if (row.expiresAt.getTime() - now < SESSION_TTL_MS / 2) {
    const expiresAt = new Date(now + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
    setSessionCookie(c, token, expiresAt);
  }
  return row.user;
}

// Loads the session user (if any) into c.var.user
export const loadUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("user", await sessionUser(c, c.var.db));
  await next();
};

export const requireUser: MiddlewareHandler<UserEnv> = async (c, next) => {
  if (!c.var.user) return c.json({ message: "Unauthorized" }, 401);
  await next();
};

export const requireAdmin: MiddlewareHandler<UserEnv> = async (c, next) => {
  if (!c.var.user) return c.json({ message: "Unauthorized" }, 401);
  if (!c.var.user.isAdmin) return c.json({ message: "Forbidden: Admin access required" }, 403);
  await next();
};
