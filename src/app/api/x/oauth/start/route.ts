import { withUser } from '@/server/request-auth';
import { requireSession } from '@/server/auth';
import { readJsonBody } from '@/server/api-guard';
import { startXOAuth } from '@/server/x-oauth';
export const runtime = 'nodejs';
export const POST = withUser(async (request: Request) => {
  const session = await requireSession(request);
  if (!session) return Response.json({error:'Oturum gerekli'}, {status:401});
  try {
    const body = await readJsonBody(request);
    const result = await startXOAuth({ownerUserId:session.user.id,sessionId:session.session.id,returnTo:typeof body.returnTo === 'string' ? body.returnTo : undefined});
    return Response.json(result, {headers:{'cache-control':'no-store'}});
  } catch { return Response.json({error:'X bağlantısı başlatılamadı; sunucu yapılandırmasını kontrol edin'}, {status:400}); }
});
