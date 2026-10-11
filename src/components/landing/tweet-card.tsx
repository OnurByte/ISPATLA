import type { ReactNode } from "react";
import { Heart, MessageCircle, Repeat2, Upload } from "lucide-react";

export function TweetCard({ source, synthetic, children }: { source: string; synthetic: string; children: ReactNode }) {
  const handle = source.split(" · ")[0];
  const name = handle.replace(/^@/, "").replace(/_/g, " ");
  return <div className="min-w-0 rounded-2xl border border-[#16191e]/25 bg-[var(--press-paper)] p-5 text-[var(--press-ink)] sm:p-6">
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--press-ink)] text-sm font-bold uppercase text-[var(--press-paper)]">{name.slice(0, 2)}</span>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold capitalize">{name}</p><p className="truncate text-sm text-[var(--press-warm)]" dir="ltr">{handle}</p></div>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0 fill-current"><path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.3l7.2-8.3L.8 2h6.5l4.5 6.8L18.9 2Zm-1.1 18h1.7L6.3 3.9H4.5L17.8 20Z" /></svg>
    </div>
    <p className="mt-5 whitespace-pre-wrap break-words text-lg leading-7">{children}</p>
    <div aria-hidden="true" className="mt-5 flex justify-between border-t border-[#16191e]/15 pt-4 text-[var(--press-warm)]"><MessageCircle size={18} /><Repeat2 size={18} /><Heart size={18} /><Upload size={18} /></div>
    <span className="sr-only">{synthetic}</span>
  </div>;
}

