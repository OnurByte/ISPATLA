import { NextResponse } from "next/server";
import { getAuth, requireSession } from "@/server/auth";

export async function GET(request: Request) {
  const current = await requireSession(request);
  if (!current) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  const sessions = await (await getAuth()).api.listSessions({ headers: request.headers });
  return NextResponse.json(sessions.map(({ id, createdAt, updatedAt, userAgent }) => ({
    id, createdAt, updatedAt, userAgent, current: id === current.session.id,
  })));
}

export async function DELETE(request: Request) {
  const current = await requireSession(request);
  if (!current) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  const { id } = await request.json().catch(() => ({}));
  if (typeof id !== "string" || !id || id === current.session.id) return NextResponse.json({ error: "Geçersiz oturum" }, { status: 400 });
  const auth = await getAuth();
  const sessions = await auth.api.listSessions({ headers: request.headers });
  const target = sessions.find((session) => session.id === id);
  if (!target) return NextResponse.json({ error: "Oturum bulunamadı" }, { status: 404 });
  await auth.api.revokeSession({ headers: request.headers, body: { token: target.token } });
  return NextResponse.json({ ok: true });
}
