import {expect,test} from 'bun:test';
import {LOCALES} from '@/i18n/config';
import {uiMessages,getUiText,getUiMessages,getUiAliases} from '@/i18n/ui';
import {resolveUiText} from '@/i18n/ui-format';
const slots=(value:string)=>[...new Set(value.match(/\{[A-Za-z][A-Za-z0-9_]*\}/g)||[])].sort();
test('every workspace message has every locale and preserves interpolation slots',()=>{
 const missing:string[]=[];
 for(const[key,values]of Object.entries(uiMessages))for(const locale of LOCALES){
  if(!values[locale]?.trim())missing.push(`${locale}: ${key}`);
  else if(JSON.stringify(slots(values[locale]))!==JSON.stringify(slots(key)))missing.push(`${locale} placeholders: ${key}`);
 }
 expect(missing).toEqual([]);
});
test('client receives only the selected locale and resolves legacy Turkish aliases',()=>{
 for(const locale of LOCALES){
  const messages=getUiMessages(locale);
  expect(messages['Refresh']).toBe(uiMessages.Refresh[locale]);
  expect(resolveUiText(messages,getUiAliases(),'Yenile')).toBe(uiMessages.Refresh[locale]);
 }
 expect(getUiText('tr','No drafts yet. Choose an opportunity or start with your own idea.')).toContain('Henüz');
});
test('user prose and unknown placeholders remain unchanged',()=>{
 const text='My original private draft ⁜ {unfilled}';
 expect(getUiText('ja',text)).toBe(text);
 for(const value of ['toString','constructor','__proto__']){
  expect(getUiText('ja',value)).toBe(value);
  expect(resolveUiText(getUiMessages('ja'),getUiAliases(),value)).toBe(value);
 }
});

test('locale payload covers translation keys throughout imported client component trees',async()=>{
 const ts=await import('typescript');
 const {existsSync,readFileSync}=await import('node:fs');
 const {resolve,dirname}=await import('node:path');
 const routes=['dashboard','opportunities','accounts','categories','sources','drafts','queue','analytics','evaluation','profile','settings','settings/keys','settings/style','settings/security','settings/appearance','settings/automation','onboarding'];
 const failures:string[]=[];
 for(const route of routes){
  const base='src/app/(workspace)/(protected)/'+route;
  const page=resolve(base+'/page.tsx');expect(existsSync(page),route).toBe(true);
  const messages=getUiMessages('tr'),aliases=getUiAliases(),visited=new Set<string>();
  function inspect(file:string){
   if(visited.has(file))return;visited.add(file);
   const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
   function walk(node:import('typescript').Node){
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='t'&&node.arguments[0]&&ts.isStringLiteralLike(node.arguments[0])){
     const key=node.arguments[0].text;
     if(!messages[key]&&!messages[aliases[key]])failures.push(`${route}: ${key}`);
    }
    if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)){
     const spec=node.moduleSpecifier.text;
     const path=spec.startsWith('@/components/')?resolve('src',spec.slice(2)):spec.startsWith('.')?resolve(dirname(file),spec):null;
     if(path&&existsSync(path+'.tsx'))inspect(path+'.tsx');
    }
    ts.forEachChild(node,walk);
   }
   walk(source);
  }
  inspect(page);
 }
 expect(failures).toEqual([]);
});
