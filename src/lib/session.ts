import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, destroySession, userFromSessionToken, type User } from "./services/users";

const COOKIE = "ryms_session";

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  return userFromSessionToken(jar.get(COOKIE)?.value);
}

/** Varje sida och varje serveråtgärd som rör användardata går genom den här. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/valkommen");
  return user;
}

export async function sessionToken(): Promise<string | null> {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

export async function signIn(userId: string): Promise<void> {
  const { token, expires } = createSession(userId);
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.RYMS_INSECURE_COOKIES !== "1", path: "/", expires });
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) destroySession(token);
  jar.delete(COOKIE);
}

/** Skydd mot förfalskade anrop till API-rutter: avsändarens Origin måste vara appens egen. */
export async function sameOrigin(): Promise<boolean> {
  const h = await headers();
  const origin = h.get("origin");
  if (!origin) return false;
  try {
    const host = h.get("x-forwarded-host") ?? h.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function appUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function psuContext(): Promise<{ ip?: string; userAgent?: string }> {
  const h = await headers();
  return { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined, userAgent: h.get("user-agent") ?? undefined };
}
