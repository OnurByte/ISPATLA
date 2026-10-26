import {expect,test} from 'bun:test';
import {localizeApiErrorResponse} from '@/server/api-errors';

test('API errors redact SQL and bound parameters, preserving status and headers',async()=>{
 const request=new Request('http://localhost/api/categories',{headers:{cookie:'ispatla-locale=tr'}});
 const original=Response.json({error:'Failed query: insert into "ispatla_app"."account_categories" values ($1) params: private-value'},{status:400,headers:{'Retry-After':'15'}});
 const response=await localizeApiErrorResponse(request,original);
 expect(response.status).toBe(400);expect(response.headers.get('Retry-After')).toBe('15');
 const text=JSON.stringify(await response.json());expect(text).not.toContain('private-value');expect(text).not.toContain('insert into');expect(text).toContain('İstek');
});
test('authentication errors follow an explicitly saved locale, defaulting to English',async()=>{
 for(const [cookie,expected]of [['','Sign in required.'],['ispatla-locale=tr','Oturum gerekli'],['ispatla-locale=ja','ログインが必要です。']]){
  const response=await localizeApiErrorResponse(new Request('http://localhost/api/profile',{headers:{cookie}}),Response.json({error:'Oturum gerekli'},{status:401}));
  expect((await response.json()).error).toBe(expected);
 }
});
test('success and non-JSON responses are untouched',async()=>{
 const success=Response.json({text:'Private user text: Oturum gerekli'});
 expect(await localizeApiErrorResponse(new Request('http://localhost/api/drafts'),success)).toBe(success);
 const plain=new Response('temporary failure',{status:503});expect(await localizeApiErrorResponse(new Request('http://localhost/api/profile'),plain)).toBe(plain);
});
test('unknown backend errors are localized and approval requirements keep their useful detail',async()=>{
 const request=new Request('http://localhost/api/queue',{headers:{cookie:'ispatla-locale=ja'}});
 const unknown=await localizeApiErrorResponse(request,Response.json({error:'bilinmeyen iç sunucu hatası'},{status:400}));
 expect((await unknown.json()).error).toBe('リクエストを完了できませんでした。もう一度お試しください。');
 const approval=await localizeApiErrorResponse(request,Response.json({error:'draft #123: kalite kontrolü ve insan onayı gerekli'},{status:400}));
 expect((await approval.json()).error).toBe('下書き #123：品質チェックと人による承認が必要です。');
});
test('AI connection machine codes remain stable while their recovery message is localized',async()=>{
 for(const code of ['unsupported_model_or_task','provider_unavailable','unknown_cost_under_budget','budget_limit','connection_test_failed']){
  const response=await localizeApiErrorResponse(new Request('http://localhost/api/settings/ai/test',{headers:{cookie:'ispatla-locale=tr'}}),Response.json({ok:false,error:code},{status:409}));
  const body=await response.json();expect(body.error).toBe(code);expect(body.message).toBeString();expect(body.message).not.toBe(code);expect(body.ok).toBe(false);expect(response.status).toBe(409);
 }
});
