import { NextResponse } from "next/server";
import { withUser } from "@/server/request-auth";
import { getDraft } from "@/server/db";
import { getDraftRevisions } from "@/server/draft-revisions";

export const runtime = "nodejs";

function GETHandler(_request: Request, context: { params: Promise<{ id: string }> }) {
  return context.params.then(({ id }) => {
    const draftId = Number(id);
    if (!Number.isSafeInteger(draftId) || draftId < 1 || !getDraft(draftId)) {
      return NextResponse.json({ error: "draft bulunamadı" }, { status: 404 });
    }
    return NextResponse.json(getDraftRevisions(draftId));
  });
}

export const GET = withUser(GETHandler);
