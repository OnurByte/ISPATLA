import {expect,test} from 'bun:test';
import {encryptSecret,decryptSecret} from '@/server/vault';
test('vault encrypts authenticated secret envelopes and rejects tampering',()=>{
 const previous=process.env.ISPATLA_SECRET_KEY;process.env.ISPATLA_SECRET_KEY='fixture-vault-key';
 try{const encrypted=encryptSecret('fixture-value');expect(encrypted).not.toContain('fixture-value');expect(decryptSecret(encrypted)).toBe('fixture-value');const parts=encrypted.split(':');parts[2]=Buffer.alloc(16).toString('base64url');expect(()=>decryptSecret(parts.join(':'))).toThrow();}
 finally{if(previous===undefined)delete process.env.ISPATLA_SECRET_KEY;else process.env.ISPATLA_SECRET_KEY=previous;}
});
