import { cookieJar } from "./runtime";
export async function cookies() {
  return cookieJar;
}
export async function headers() {
  const h: Record<string, string> = { origin: location.origin, host: location.host, "user-agent": navigator.userAgent };
  return { get: (k: string) => h[k.toLowerCase()] ?? null };
}
