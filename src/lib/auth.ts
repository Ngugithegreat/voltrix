import { cookies } from "next/headers";
import { createHash } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db, dbUrl, ensureSchema } from "./db";

const COOKIE = "voltrix_session";
const ADMIN_COOKIE = "voltrix_admin";
const DAY = 60 * 60 * 24;

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: "user" | "admin";
};

function secret(): Uint8Array {
  // Prefer an explicit AUTH_SECRET. If it's not set, derive a STABLE secret from
  // the database URL so logins keep working across deploys without extra config.
  // (Setting AUTH_SECRET is still recommended for production.)
  const explicit = process.env.AUTH_SECRET;
  if (explicit) return new TextEncoder().encode(explicit);
  const url = dbUrl();
  if (url) {
    const derived = createHash("sha256").update("voltrix::" + url).digest("hex");
    return new TextEncoder().encode(derived);
  }
  throw new Error("AUTH_SECRET is not set and no database URL is available to derive one.");
}

// ---- Operator admin panel (separate from user accounts) ----
// Access is gated by a single shared password stored in ADMIN_PANEL_PASSWORD.

export function adminPasswordConfigured(): boolean {
  return !!process.env.ADMIN_PANEL_PASSWORD;
}

export function checkAdminPassword(pw: string): boolean {
  const expected = process.env.ADMIN_PANEL_PASSWORD;
  return !!expected && typeof pw === "string" && pw === expected;
}

export async function createAdminSession(): Promise<void> {
  const token = await new SignJWT({ admin: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(secret());
  cookies().set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DAY,
  });
}

export function clearAdminSession(): void {
  cookies().set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
}

export async function isAdmin(): Promise<boolean> {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.admin === true;
  } catch {
    return false;
  }
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());

  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * DAY,
  });
}

export function clearSession(): void {
  cookies().set(COOKIE, "", { path: "/", maxAge: 0 });
}

/** Returns the logged-in user from the signed cookie, or null. */
export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: Number(payload.sub),
      email: String(payload.email),
      name: String(payload.name),
      role: (payload.role as "user" | "admin") ?? "user",
    };
  } catch {
    return null;
  }
}

/**
 * Loads the freshest user row (balance etc.) straight from the DB for the
 * currently logged-in session. Returns null if not authenticated.
 */
export async function currentUser(): Promise<{
  id: number;
  email: string;
  name: string;
  role: "user" | "admin";
  balance: number;
  country: string | null;
} | null> {
  const s = await getSession();
  if (!s) return null;
  await ensureSchema();
  const sql = db();
  const rows = (await sql`
    SELECT id, email, name, role, balance, country FROM voltrix_users WHERE id = ${s.id} LIMIT 1
  `) as Array<{
    id: number;
    email: string;
    name: string;
    role: "user" | "admin";
    balance: string | number;
    country: string | null;
  }>;
  if (!rows.length) return null;
  const u = rows[0];
  return { ...u, balance: Number(u.balance) };
}
