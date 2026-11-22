/**
 * Ryms som körs helt i webbläsaren – för förhandsvisning.
 * Samma sidor, komponenter och beräkningskod som appen; servern ersätts av stand-ins i ./shims.
 * Allt ligger i minnet och försvinner när sidan laddas om.
 */
import { cloneElement, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import initSqlJs from "sql.js/dist/sql-asm.js";
import "@fontsource/castoro/400.css";
import "@fontsource-variable/geist";
import "../src/app/globals.css";

import { LocaleProvider } from "../src/components/Locale";
import { getCurrency, getLocale } from "../src/lib/locale";
import { CURRENCIES } from "../src/lib/money";
import { readImage } from "../src/lib/services/images";
import { userFromSessionToken } from "../src/lib/services/users";
import AppLayout from "../src/app/(app)/layout";
import Home from "../src/app/(app)/page";
import Plan from "../src/app/(app)/plan/page";
import Saved from "../src/app/(app)/sparat/page";
import Transactions from "../src/app/(app)/transaktioner/page";
import Settings from "../src/app/(app)/installningar/page";
import Bank from "../src/app/(app)/installningar/bank/page";
import FlowLayout from "../src/app/(flow)/layout";
import RymsDet from "../src/app/(flow)/ryms-det/page";
import Onboarding from "../src/app/(flow)/kom-igang/page";
import Welcome from "../src/app/(public)/valkommen/page";
import Login from "../src/app/(public)/logga-in/page";
import Signup from "../src/app/(public)/skapa-konto/page";
import { POST as analyzePost } from "../src/app/api/analyze/route";
import { POST as imagesPost } from "../src/app/api/images/route";
import { cookieJar, RedirectError, state } from "./shims/runtime";
import { setSqlModule } from "./shims/sqlite";

declare const __ASSETS__: Record<string, string>;
type Comp = (props: Record<string, unknown>) => unknown;
const ROUTES: Record<string, { page: Comp; layout?: Comp }> = {
  "/": { page: Home as Comp, layout: AppLayout as Comp },
  "/plan": { page: Plan as Comp, layout: AppLayout as Comp },
  "/sparat": { page: Saved as Comp, layout: AppLayout as Comp },
  "/transaktioner": { page: Transactions as Comp, layout: AppLayout as Comp },
  "/installningar": { page: Settings as Comp, layout: AppLayout as Comp },
  "/installningar/bank": { page: Bank as Comp, layout: AppLayout as Comp },
  "/ryms-det": { page: RymsDet as Comp, layout: FlowLayout as Comp },
  "/kom-igang": { page: Onboarding as Comp, layout: FlowLayout as Comp },
  "/valkommen": { page: Welcome as Comp },
  "/logga-in": { page: Login as Comp },
  "/skapa-konto": { page: Signup as Comp },
};

/** Kör serverkomponenterna (asynkrona funktioner) och lämnar klientkomponenterna åt React. */
async function resolve(node: unknown): Promise<ReactNode> {
  if (node == null || typeof node !== "object") return node as ReactNode;
  if (Array.isArray(node)) return Promise.all(node.map(resolve));
  if (!isValidElement(node)) return node as ReactNode;
  const el = node as ReactElement<Record<string, unknown>>;
  const type = el.type as unknown;
  if (typeof type === "function" && !(type as { $$client?: boolean }).$$client) {
    const out = await resolve(await (type as Comp)(el.props));
    return el.key != null ? <Fragment key={el.key}>{out}</Fragment> : out;
  }
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(el.props)) {
    if (isValidElement(v) || (Array.isArray(v) && v.some((x) => x && typeof x === "object"))) patch[k] = await resolve(v);
  }
  return Object.keys(patch).length ? cloneElement(el, patch) : el;
}

const root = createRoot(document.getElementById("app")!);
let ticket = 0;
async function render(): Promise<void> {
  const mine = ++ticket;
  const route = ROUTES[state.path] ?? ROUTES["/"];
  try {
    const page = <route.page searchParams={Promise.resolve(state.query)} />;
    const tree = await resolve(route.layout ? <route.layout>{page}</route.layout> : page);
    if (mine !== ticket) return;
    const locale = await getLocale();
    const currency = await getCurrency();
    document.documentElement.lang = locale;
    document.documentElement.style.setProperty("--cur", JSON.stringify(CURRENCIES[currency].symbol));
    root.render(
      <LocaleProvider locale={locale} currency={currency}>
        <Fragment key={state.path}>{tree}</Fragment>
      </LocaleProvider>,
    );
  } catch (e) {
    if (e instanceof RedirectError) return navigate(e.url, true);
    console.error(e);
    if (mine === ticket) root.render(<p style={{ padding: 24 }}>Något gick fel i förhandsvisningen: {String((e as Error).message)}</p>);
  }
}
function navigate(url: string, _replace?: boolean): void {
  const u = new URL(url, "http://ryms.local");
  state.path = u.pathname.replace(/\/$/, "") || "/";
  state.query = Object.fromEntries(u.searchParams);
  for (const l of state.listeners) l();
  window.scrollTo(0, 0);
  void render();
}
state.navigate = navigate;
state.rerender = () => void render();

// Bekräftelsedialoger finns inte i den här visningen – räkna dem som godkända.
window.confirm = () => true;

// Interna länkar byter sida utan att ladda om.
document.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
  const href = a?.getAttribute("href");
  if (!href || !href.startsWith("/") || e.defaultPrevented) return;
  e.preventDefault();
  navigate(href);
});

// API-rutterna anropas direkt i stället för över nätet.
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = url.startsWith("/") ? url : "";
  if (path.startsWith("/api/")) {
    const req = new Request("http://ryms.local" + path, { method: init?.method ?? "GET", body: init?.body });
    if (path === "/api/analyze") return analyzePost(req);
    if (path === "/api/images") return imagesPost(req);
    return new Response("Not found", { status: 404 });
  }
  return realFetch(input, init);
};

// Bilder: inbäddade filer och sparade foton i minnet.
const blobs = new Map<string, string>();
function fixImage(img: HTMLImageElement) {
  const src = img.getAttribute("src") ?? "";
  if (__ASSETS__[src]) img.src = __ASSETS__[src];
  const m = /^\/api\/images\/([0-9a-f-]{36})$/.exec(src);
  if (m) {
    const user = userFromSessionToken(cookieJar.get("ryms_session")?.value);
    const file = user ? readImage(user.id, m[1]) : null;
    if (!file) return;
    if (!blobs.has(m[1])) blobs.set(m[1], URL.createObjectURL(new Blob([new Uint8Array(file.data)], { type: file.mime })));
    img.src = blobs.get(m[1])!;
  }
}
new MutationObserver((list) => {
  for (const m of list) {
    if (m.type === "attributes" && m.target instanceof HTMLImageElement) fixImage(m.target);
    m.addedNodes.forEach((n) => {
      if (n instanceof HTMLImageElement) fixImage(n);
      else if (n instanceof HTMLElement) n.querySelectorAll("img").forEach(fixImage);
    });
  }
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });

(async () => {
  setSqlModule(await initSqlJs());
  navigate("/");
})();
