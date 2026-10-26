import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrandText, brandProse } from '../src/components/brand-text';

test('canonical prose brand includes the actual site mark while URLs and code remain literal', () => {
 const markup=renderToStaticMarkup(<BrandText text="ispatla.tr ⁜ https://ispatla.tr/mcp" />);
 expect(markup.match(/class="brand-mark/g)?.length).toBe(1);
 expect(markup).toContain('/brand/logo.svg');
 expect(markup).toContain('<span class="sr-only">ispatla.tr</span>');
 expect(markup).toContain('dir="ltr"');
 expect(markup).toContain('https://ispatla.tr/mcp');
 const code=renderToStaticMarkup(<div>{brandProse(<pre>https://ispatla.tr/mcp</pre>)}</div>);
 expect(code).toBe('<div><pre>https://ispatla.tr/mcp</pre></div>');
});
