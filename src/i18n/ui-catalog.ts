import {LOCALES,type Locale} from './config';
import type {UiCatalog} from './ui-types';
export type UiRow=readonly [en:string,zhCN:string,hi:string,es:string,fr:string,ar:string,bn:string,ptBR:string,ru:string,id:string,ur:string,de:string,ja:string,sw:string,mr:string,te:string,tr:string,ta:string,vi:string,ko:string];
/** Compact authored rows; fixed tuple order prevents missing locale cells. */
export function uiRows(rows:readonly UiRow[]):UiCatalog {
 const result:UiCatalog={};
 for(const row of rows){
  if(row.length!==LOCALES.length || row.some(value=>!value.trim()))throw new Error(`Incomplete UI translation: ${row[0]}`);
  result[row[0]]=Object.fromEntries(LOCALES.map((locale,index)=>[locale,row[index]])) as Record<Locale,string>;
 }
 return result;
}
