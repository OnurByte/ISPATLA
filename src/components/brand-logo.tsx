import Link from "next/link";

export function BrandMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return <span aria-hidden="true" className={`brand-mark inline-block shrink-0 ${className}`} style={{ width: size, height: size, mask: 'url("/brand/logo.svg") center / contain no-repeat', WebkitMask: 'url("/brand/logo.svg") center / contain no-repeat' }} />;
}

export function BrandLogo({ className = "", href = "/", ariaLabel = "Ispatla ana sayfa" }: { className?: string; href?: string; ariaLabel?: string }) {
  return <Link href={href} aria-label={ariaLabel} className={`brand-logo inline-flex min-h-11 items-center gap-2 ${className}`} dir="ltr">
    <BrandMark size={48} className="size-10! sm:size-12!" />
    <span className="brand-wordmark text-foreground text-2xl sm:text-[28px] font-bold leading-none tracking-[-0.035em]">ispatla.tr</span>
  </Link>;
}
