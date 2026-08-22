import { SignJWT, jwtVerify } from "jose";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { db } from "./db/client";
import { users } from "./db/schema";

const AUTH_COOKIE_NAME = "paykit_session";
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: AUTH_COOKIE_MAX_AGE,
};

function getSecret() {
  const s = process.env.JWT_SECRET || "payvora-super-secret-jwt-key-2026-secure";
  return new TextEncoder().encode(s);
}

function clearAuthCookie() {
  deleteCookie(AUTH_COOKIE_NAME, { path: "/" });
}

async function findUserById(id: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return user ?? null;
}

export async function authenticateUser(email: string, password: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);

  if (!user) throw new Error("Invalid email or password");

  const valid = await compare(password, user.passwordHash);
  if (!valid) throw new Error("Invalid email or password");

  const token = await new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());

  setCookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);

  return { user: { id: user.id, email: user.email, role: user.role } };
}

export async function getCurrentUser() {
  const token = getCookie(AUTH_COOKIE_NAME);
  if (!token) return null;

  try {
    const payload = await verifyToken(token);
    if (typeof payload.sub !== "string") {
      clearAuthCookie();
      return null;
    }

    const user = await findUserById(payload.sub);
    if (!user) {
      clearAuthCookie();
      return null;
    }

    return user;
  } catch {
    clearAuthCookie();
    return null;
  }
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function logoutUser() {
  clearAuthCookie();
  return { success: true };
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, getSecret());
  return payload as { sub: string; email: string; role: string };
}
