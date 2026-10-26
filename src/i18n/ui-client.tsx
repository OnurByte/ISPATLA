'use client';
import {BrandText} from '@/components/brand-text';
import {createContext,useContext,useMemo,type ReactNode} from 'react';
import {DEFAULT_LOCALE,type Locale} from './config';
import {resolveUiText} from './ui-format';
import type {UiParams} from './ui-types';
type UiLocaleData={locale:Locale;messages:Record<string,string>;aliases:Record<string,string>};
const UiLocaleContext=createContext<UiLocaleData>({locale:DEFAULT_LOCALE,messages:{},aliases:{}});
export function UiLocaleProvider({locale,messages={},aliases={},children}:UiLocaleData&{children:ReactNode}) {
 const value=useMemo(()=>({locale,messages,aliases}),[locale,messages,aliases]);
 return <UiLocaleContext.Provider value={value}>{children}</UiLocaleContext.Provider>;
}
export function useUiText(){
 const {locale,messages,aliases}=useContext(UiLocaleContext);
 const t=useMemo(()=>(message:string,params?:UiParams)=>resolveUiText(messages,aliases,message,params),[messages,aliases]);
 return {t,locale};
}
export function UiText({text,params}:{text:string;params?:UiParams}) {
 const {t}=useUiText();return <>{t(text,params)}</>;
}

export function UiBrandText({text}:{text:string}){const {t}=useUiText();return <BrandText text={t(text)} />;}
