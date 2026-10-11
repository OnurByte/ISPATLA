import { withUser } from "@/server/request-auth";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { getAuth, requireSession } from "@/server/auth";
export const runtime = "nodejs";
export const POST = withUser(async (request: Request) => {
  const denied = guardMutation(request); if (denied) return denied;
  const session = await requireSession(request);
  if (!session?.user.emailVerified || session.user.email.endsWith(".invalid")) return Response.json({ error: "Verify a real email address before setting a password." }, { status: 403 });
  try {
    const body = await readJsonBody(request);
    if (typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128) return Response.json({ error: "Password must contain 12–128 characters." }, { status: 400 });
    await (await getAuth()).api.setPassword({ headers: request.headers, body: { newPassword: body.password } });
    return Response.json({ saved: true });
  } catch { return Response.json({ error: "Password setup unavailable. Use password reset if a password already exists." }, { status: 409 }); }
});
