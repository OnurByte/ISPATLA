export function BrandMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return <span aria-hidden="true" className={`inline-block shrink-0 bg-current ${className}`} style={{ width: size, height: size, mask: 'url("/brand/ispatla-symbol.png") center / contain no-repeat' }} />;
}

export function BrandLogo({ className = "" }: { className?: string }) {
  return <span className={`inline-flex items-center gap-2 ${className}`} dir="ltr">
    <BrandMark size={44} />
    <span className="brand-wordmark text-[26px] font-bold leading-none tracking-[-0.035em]">ispatla.tr</span>
  </span>;
}
