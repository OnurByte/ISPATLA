import ts from 'typescript';
import {readdirSync,readFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {uiMessages,getUiAliases} from '../src/i18n/ui';
const aliases=getUiAliases();
const known=(text:string)=>Boolean(uiMessages[text]||aliases[text]);
// Proper names, protocol examples and mathematical notation are deliberately invariant.
const invariant=new Set(['𝕏','ispatla.tr','AI','MCP','GitHub','OnurByte','@OnurStirner','@elonmusk','𝕏 @elonmusk','OpenRouter','Arena','Jev','OpenAI','Anthropic','FXTwitter ⁜','⁜ 𝕏','⁜ n=','⁜ Brier','⁜ log loss','⁜ ECE','DLQ ⁜','UTC','v','⌘K','Esc','/h/','© 2026 ispatla.tr','ispatla.tr ⁜ 𝕏','ispatla.tr/leaderboard','post, thread, reply','bun install --frozen-lockfile','bun run dev','GitHub ⁜ ispatla.tr (','Xpatla ⁜','GitHub /','GitHub ⁜']);
const exempt=(text:string)=>invariant.has(text)||/^https?:\/\//.test(text);
const files:string[]=[];
function walk(directory:string){for(const entry of readdirSync(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory())walk(path);else if(/\.tsx?$/.test(path))files.push(path);}}
walk('src/components');walk('src/app');
const missing:Array<{file:string;line:number;kind:string;text:string}>=[];
for(const file of files){
 const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const report=(node:ts.Node,kind:string,text:string)=>missing.push({file:relative('.',file),line:source.getLineAndCharacterOfPosition(node.getStart()).line+1,kind,text});
 function visit(node:ts.Node){
  if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='t'&&node.arguments[0]&&ts.isStringLiteralLike(node.arguments[0])){
   const text=node.arguments[0].text;if(!known(text))report(node,'missing-key',text);
  }
  if(ts.isJsxText(node)&&/\p{L}/u.test(node.text)){
   const text=node.text.replace(/\s+/g,' ').trim();if(text&&!exempt(text))report(node,'hardcoded-text',text);
  }
  if(ts.isJsxAttribute(node)&&node.initializer&&ts.isStringLiteral(node.initializer)){
   const name=node.name.getText(source),text=node.initializer.text;
   const parent=node.parent.parent;
   const tag=(ts.isJsxOpeningElement(parent)||ts.isJsxSelfClosingElement(parent))?parent.tagName.getText(source):'';
   const translated=(tag==='PageHeading'&&['eyebrow','title','description'].includes(name))||(['UiText','UiBrandText'].includes(tag)&&name==='text');
   if(translated&&!known(text))report(node,'missing-component-key',text);
   else if(!translated&&['placeholder','aria-label','title','alt'].includes(name)&&/\p{L}/u.test(text)&&!exempt(text))report(node,'hardcoded-attribute',text);
  }
  ts.forEachChild(node,visit);
 }
 visit(source);
}
if(missing.length){console.error(JSON.stringify(missing,null,2));process.exitCode=1;}
else console.log(`Localization keys and visible literals covered across ${files.length} source files; ${Object.keys(uiMessages).length} messages.`);
