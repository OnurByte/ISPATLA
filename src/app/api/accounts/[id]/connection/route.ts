import { withUser } from '@/server/request-auth';
import { currentOwnerId } from '@/server/owner-context';
import { revokeXAccount, getXAccountAuthState } from '@/server/x-oauth';
import { getPostgresXAccounts } from '@/server/postgres-x-oauth';
export const runtime = 'nodejs';
type Context = {params:Promise<{id:string}>};
export const GET = withUser(async (_request: Request, context:Context) => {
  const id=Number((await context.params).id);
  const owner = currentOwnerId()!;
  if (!(await getPostgresXAccounts(owner)).some(account=>account.id===id)) return Response.json({error:'Hesap bulunamadı'},{status:404});
  return Response.json(await getXAccountAuthState(id,owner),{headers:{'cache-control':'no-store'}});
});
export const DELETE = withUser(async (_request: Request, context:Context) => {
  const id=Number((await context.params).id);
  const owner = currentOwnerId()!;
  if (!(await getPostgresXAccounts(owner)).some(account=>account.id===id)) return Response.json({error:'Hesap bulunamadı'},{status:404});
  try { const result = await revokeXAccount({accountId:id,ownerUserId:owner}); return Response.json(result); }
  catch {return Response.json({error:'Bağlantı kaldırılamadı'},{status:400});}
});
