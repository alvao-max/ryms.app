/** Delat tillstånd för webbläsarversionen: var vi är, kakor och hur man byter sida. */
export const state = {
  path: "/",
  query: {} as Record<string, string>,
  navigate: (_url: string, _replace?: boolean) => {},
  rerender: () => {},
  listeners: new Set<() => void>(),
};
export class RedirectError extends Error {
  digest = "NEXT_REDIRECT";
  constructor(public url: string) {
    super("NEXT_REDIRECT");
  }
}
const jar = new Map<string, string>();
try {
  for (const [k, v] of Object.entries(JSON.parse(localStorage.getItem("ryms-live-cookies") ?? "{}"))) jar.set(k, String(v));
} catch {}
function persist() {
  try {
    localStorage.setItem("ryms-live-cookies", JSON.stringify(Object.fromEntries(jar)));
  } catch {}
}
export const cookieJar = {
  get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  set: (name: string, value: string) => {
    jar.set(name, value);
    persist();
  },
  delete: (name: string) => {
    jar.delete(name);
    persist();
  },
};
/** Serveråtgärder körs här i webbläsaren: fånga omdirigeringar och rita om efteråt. */
export function wrapAction<A extends unknown[], R>(fn: (...a: A) => Promise<R>) {
  return async (...a: A): Promise<R | undefined> => {
    try {
      const r = await fn(...a);
      state.rerender();
      return r;
    } catch (e) {
      if (e instanceof RedirectError) {
        state.navigate(e.url, true);
        return undefined;
      }
      throw e;
    }
  };
}
