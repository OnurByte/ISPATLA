import {expect,test} from 'bun:test';
import {LOCALES} from '@/i18n/config';
import {getDictionary} from '@/i18n/dictionaries';
import {rootMetadata} from '@/i18n/metadata';
import {PUBLIC_ORIGIN} from '@/i18n/public-metadata';
import {SITE_ICON_METADATA} from '@/lib/site-icons';

test('shared page titles and descriptions use the selected locale without changing the site identity',()=>{
 for(const locale of LOCALES){
  const metadata=rootMetadata(locale),{nav}=getDictionary(locale);
  expect(metadata.title).toBe(`ispatla.tr ⁜ ${nav.primary}`);
  expect(metadata.description).toBe(nav.shellDescription);
  expect(metadata.metadataBase?.toString()).toBe(PUBLIC_ORIGIN+'/');
  expect(metadata.icons).toEqual(SITE_ICON_METADATA);
 }
});

test("private and auth pages default to noindex while public routes opt in", () => {
  for (const locale of LOCALES) {
    expect(rootMetadata(locale).robots).toEqual({ index: false, follow: true });
  }
});
