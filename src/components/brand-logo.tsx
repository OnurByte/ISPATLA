import Link from "next/link";

export function BrandMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return <span aria-hidden="true" className={`brand-gradient-mark inline-block shrink-0 ${className}`} style={{ width: size, height: size, mask: 'url("/brand/ispatla-symbol.png") center / contain no-repeat' }} />;
}

export function BrandLogo({ className = "", href = "/", ariaLabel = "Ispatla ana sayfa" }: { className?: string; href?: string; ariaLabel?: string }) {
  return <Link href={href} aria-label={ariaLabel} className={`inline-flex items-center gap-2 ${className}`} dir="ltr">
    <BrandMark size={44} />
    <span className="brand-wordmark text-foreground text-[26px] font-bold leading-none tracking-[-0.035em]">ispatla.tr</span>
  </Link>;
}
