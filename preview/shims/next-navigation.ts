import { useSyncExternalStore } from "react";
import { RedirectError, state } from "./runtime";
export function redirect(url: string): never {
  throw new RedirectError(url);
}
const sub = (cb: () => void) => {
  state.listeners.add(cb);
  return () => state.listeners.delete(cb);
};
export function usePathname(): string {
  return useSyncExternalStore(sub, () => state.path);
}
export function useRouter() {
  return { push: (u: string) => state.navigate(u), replace: (u: string) => state.navigate(u, true), refresh: () => state.rerender() };
}
export function notFound(): never {
  throw new RedirectError("/");
}
