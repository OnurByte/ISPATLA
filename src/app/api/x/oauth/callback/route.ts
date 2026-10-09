import { withUser } from '@/server/request-auth';
import { requireSession } from '@/server/auth';
import { completeXOAuth } from '@/server/x-oauth';
export const runtime = 'nodejs';
export const GET = withUser(async (request: Request) => {
  const session = await requireSession(request);
  if (!session) return Response.json({error:'Oturum gerekli'}, {status:401});
  try {
    const result = await completeXOAuth({request,ownerUserId:session.user.id,sessionId:session.session.id});
    return Response.redirect(new URL(result.returnTo, process.env.BETTER_AUTH_URL || request.url),303);
  } catch {
    // Codes, state and provider payloads must never enter logs or response bodies.
    return Response.redirect(new URL('/accounts?connection=failed',process.env.BETTER_AUTH_URL || request.url),303);
  }
});
