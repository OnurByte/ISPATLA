import type {UiParams} from './ui-types';
export function formatUiText(template:string,params:UiParams={}):string {
 return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g,(match,name:string)=>params[name]===undefined?match:String(params[name]));
}
export function resolveUiText(messages:Record<string,string>,aliases:Record<string,string>,message:string,params?:UiParams):string {
 const key=Object.hasOwn(messages,message)?message:Object.hasOwn(aliases,message)?aliases[message]:message;
 return formatUiText(Object.hasOwn(messages,key)?messages[key]:message,params);
}
