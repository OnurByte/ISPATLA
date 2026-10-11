import type { ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from "@/components/ui/card";
import { Heart, MessageCircle, Repeat2, Upload } from "lucide-react";

const profiles: Record<string, { name: string; handle: string; avatar: string }> = {
  "@productnotes": { name: "Maya Chen", handle: "@productnotes", avatar: "productnotes" },
  "@dailyhacks": { name: "Lena Brooks", handle: "@dailyhacks", avatar: "dailyhacks" },
  "@openrecords": { name: "Alex Rivera", handle: "@openrecords", avatar: "openrecords" },
  "@sample_account": { name: "Deniz Kaya", handle: "@denizwrites", avatar: "denizwrites" },
};

export function TweetCard({ source, synthetic, children }: { source: string; synthetic: string; children: ReactNode }) {
  const sourceHandle = source.split(" · ")[0];
  const profile = profiles[sourceHandle];
  const handle = profile?.handle ?? sourceHandle;
  const name = profile?.name ?? handle.replace(/^@/, "").replace(/_/g, " ");
  const initials = name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  return <Card className="min-w-0">
    <CardHeader className="has-data-[slot=card-action]:grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3">
      <Avatar size="lg" aria-hidden="true" className="row-span-2">{profile && <AvatarImage src={`/landing/avatars/${profile.avatar}.svg`} alt="" />}<AvatarFallback>{initials}</AvatarFallback></Avatar>
      <CardTitle className="truncate">{name}</CardTitle>
      <CardDescription className="col-start-2 truncate" dir="ltr">{handle}</CardDescription>
      <CardAction className="col-start-3"><span aria-hidden="true" className="text-xl leading-none">𝕏</span></CardAction>
    </CardHeader>
    <CardContent><p className="whitespace-pre-wrap break-words text-lg leading-7">{children}</p><span className="sr-only">{synthetic}</span></CardContent>
    <CardFooter aria-hidden="true" className="justify-between"><MessageCircle size={18} /><Repeat2 size={18} /><Heart size={18} /><Upload size={18} /></CardFooter>
  </Card>;
}
