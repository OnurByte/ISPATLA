import type { ReactNode } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from "@/components/ui/card";
import { Heart, MessageCircle, Repeat2, Upload } from "lucide-react";

export function TweetCard({ source, synthetic, children }: { source: string; synthetic: string; children: ReactNode }) {
  const handle = source.split(" · ")[0];
  const name = handle.replace(/^@/, "").replace(/_/g, " ");
  return <Card className="min-w-0">
    <CardHeader className="has-data-[slot=card-action]:grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3">
      <Avatar size="lg" aria-hidden="true" className="row-span-2"><AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
      <CardTitle className="truncate capitalize">{name}</CardTitle>
      <CardDescription className="col-start-2 truncate" dir="ltr">{handle}</CardDescription>
      <CardAction className="col-start-3"><svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-current"><path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.3l7.2-8.3L.8 2h6.5l4.5 6.8L18.9 2Zm-1.1 18h1.7L6.3 3.9H4.5L17.8 20Z" /></svg></CardAction>
    </CardHeader>
    <CardContent><p className="whitespace-pre-wrap break-words text-lg leading-7">{children}</p><span className="sr-only">{synthetic}</span></CardContent>
    <CardFooter aria-hidden="true" className="justify-between"><MessageCircle size={18} /><Repeat2 size={18} /><Heart size={18} /><Upload size={18} /></CardFooter>
  </Card>;
}
