import { PublicFooter } from '@/components/public-footer';
import { headers } from 'next/headers';
import Link from 'next/link';
import { DEFAULT_LOCALE, isLocale, localizePath, LOCALE_CONFIG } from '@/i18n/config';
import { publicUiCopy } from '@/i18n/public-ui-copy';
import { PublicHeaderContent } from '@/components/public-header-content';
import { buttonVariants } from '@/components/ui/button';

export default async function NotFound() {
  const requested = (await headers()).get('x-ispatla-locale') || DEFAULT_LOCALE;
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;
  const copy = publicUiCopy[locale];
  return <div lang={locale} dir={LOCALE_CONFIG[locale].dir}>
    <PublicHeaderContent locale={locale} authenticated={false} />
    <main className="site-container not-found-page">
      <p className="not-found-number" aria-label="404" dir="ltr">404</p>
      <div className="not-found-copy"><h1>{copy.title}</h1><p>{copy.body}</p>
        <nav className="flex flex-wrap gap-3" aria-label={copy.home}>
          <Link href={localizePath(locale, '/')} className={buttonVariants({className:'min-h-11 max-w-full whitespace-normal px-5'})}>{copy.home}</Link>
          <Link href={localizePath(locale, '/docs')} className={buttonVariants({variant:'outline',className:'min-h-11 max-w-full whitespace-normal px-5'})}>{copy.docs}</Link>
        </nav>
      </div>
    </main>
    <PublicFooter locale={locale} />
  </div>;
}
