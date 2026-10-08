import { withUser } from '@/server/request-auth';
import { currentOwnerId } from '@/server/owner-context';
import { getAccounts } from '@/server/db';
import { revokeXAccount, getXAccountAuthState } from '@/server/x-oauth';
export const runtime = 'nodejs';
type Context = {params:Promise<{id:string}>};
export const GET = withUser(async (_request: Request, context:Context) => {
  const id=Number((await context.params).id);
  if (!getAccounts().some(account=>account.id===id)) return Response.json({error:'Hesap bulunamadı'},{status:404});
  return Response.json(getXAccountAuthState(id,currentOwnerId()!),{headers:{'cache-control':'no-store'}});
});
export const DELETE = withUser(async (_request: Request, context:Context) => {
  const id=Number((await context.params).id);
  if (!getAccounts().some(account=>account.id===id)) return Response.json({error:'Hesap bulunamadı'},{status:404});
  try { const result = await revokeXAccount({accountId:id,ownerUserId:currentOwnerId()!}); return Response.json(result); }
  catch {return Response.json({error:'Bağlantı kaldırılamadı'},{status:400});}
});
