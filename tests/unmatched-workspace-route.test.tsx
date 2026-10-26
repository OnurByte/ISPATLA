import { expect, mock, test } from 'bun:test';
let route='/missing/nested/path';
const requireUser=mock(async () => {throw new Error('AUTH_CHECK');});
mock.module('next/headers',()=>({headers:async()=>new Headers({'x-ispatla-route':route})}));
mock.module('next/navigation',()=>({notFound:()=>{throw new Error('NOT_FOUND');},redirect:()=>{throw new Error('REDIRECT');}}));
mock.module('@/server/page-auth',()=>({requirePageUser:requireUser}));
const {default:ProtectedLayout}=await import('../src/app/(workspace)/(protected)/layout');
test('an unmatched nested URL reaches 404 before any auth/database lookup',async()=>{
 route='/missing/nested/path';
 await expect(ProtectedLayout({children:null,postModal:null})).rejects.toThrow('NOT_FOUND');
 expect(requireUser).not.toHaveBeenCalled();
});
test('a real workspace URL still requires authorization',async()=>{
 route='/dashboard';
 await expect(ProtectedLayout({children:null,postModal:null})).rejects.toThrow('AUTH_CHECK');
 expect(requireUser).toHaveBeenCalledTimes(1);
});
