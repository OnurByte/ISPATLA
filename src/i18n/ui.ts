import {type Locale} from './config';
import type {UiCatalog,UiParams} from './ui-types';
import {formatUiText} from './ui-format';
import {publicMessages} from './ui-public';
import {searchMessages} from './ui-search';
import {errorMessages} from './ui-errors';
import {marketMessages} from './ui-market';
import {dashboardMessages} from './ui-dashboard';
import {commonMessages} from './ui-common';
import {draftsMessages} from './ui-drafts';
import {accountsMessages} from './ui-accounts';
import {settingsMessages} from './ui-settings';
export const uiMessages:UiCatalog={...commonMessages,...publicMessages,...searchMessages,...errorMessages,...dashboardMessages,...marketMessages,...draftsMessages,...accountsMessages,...settingsMessages};
const aliases:Record<string,string>={};
for(const [key,values] of Object.entries(uiMessages))if(values.tr)aliases[values.tr]=key;
/** Root layouts persist during client navigation: retain every namespace for this locale. */
export function getUiMessages(locale:Locale):Record<string,string>{
 return Object.fromEntries(Object.entries(uiMessages).map(([key,values])=>[key,values[locale]]));
}
export function getUiAliases():Record<string,string>{return aliases;}
export function getUiText(locale:Locale,message:string,params?:UiParams):string {
 const key=Object.hasOwn(uiMessages,message)?message:Object.hasOwn(aliases,message)?aliases[message]:message;
 return formatUiText((Object.hasOwn(uiMessages,key)?uiMessages[key]?.[locale]:undefined)||message,params);
}
