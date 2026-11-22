export const NextResponse = {
  json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), { ...init, headers: { "content-type": "application/json" } }),
  redirect: (url: string) => new Response(null, { status: 302, headers: { location: url } }),
};
