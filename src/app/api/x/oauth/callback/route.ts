export const runtime = "nodejs";
export async function GET() { return Response.json({ error: "X OAuth is disabled. Add a public handle instead." }, { status: 410, headers: { "cache-control": "no-store" } }); }
