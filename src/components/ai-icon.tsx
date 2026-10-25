export function AiIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return <span
    aria-hidden="true"
    className={`inline-block shrink-0 ${className}`}
    style={{ width: size, height: size, backgroundColor: "currentColor", mask: 'url("/brand/brain.svg") center / contain no-repeat', WebkitMask: 'url("/brand/brain.svg") center / contain no-repeat' }}
  />;
}
