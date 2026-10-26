import { afterEach, expect, mock, test } from 'bun:test';
import { postgresProfilePath } from '../src/server/postgres-public-profile';
const byHandle = mock(async (handle: string): Promise<null> => { void handle; return null; });
const bySlug = mock(async (slug: string): Promise<null> => { void slug; return null; });
mock.module('@/server/postgres-public-profile', () => ({postgresProfilePath,getPostgresPublicUserProfileByHandle:byHandle,getPostgresPublicUserProfile:bySlug}));
const {findPublicProfileByPath,findPublicProfile} = await import('../src/server/public-profile');
const previous = process.env.DATABASE_URL;
afterEach(() => { if(previous===undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL=previous; byHandle.mockClear();bySlug.mockClear(); });
test('unconfigured public handles and opaque profile paths resolve as missing without opening PostgreSQL', async () => {
 delete process.env.DATABASE_URL;
 expect(await findPublicProfileByPath('unknown')).toBeNull();
 expect(await findPublicProfile('abcdefghijklmnopqrstuvwx')).toBeNull();
 expect(await findPublicProfileByPath('u/abcdefghijklmnopqrstuvwx')).toBeNull();
 expect(byHandle).not.toHaveBeenCalled(); expect(bySlug).not.toHaveBeenCalled();
});
test('configured public lookup still queries the backend and does not disguise database failures as a missing profile', async () => {
 process.env.DATABASE_URL='postgresql://fixture:fixture@127.0.0.1/fixture';
 byHandle.mockRejectedValueOnce(new Error('fixture backend unavailable'));
 await expect(findPublicProfileByPath('unknown')).rejects.toThrow('fixture backend unavailable');
 expect(byHandle).toHaveBeenCalledWith('unknown');
});
