import type { Locale } from './config';
export type UiParams = Record<string,string|number>;
export type UiCatalog = Record<string,Record<Locale,string>>;
