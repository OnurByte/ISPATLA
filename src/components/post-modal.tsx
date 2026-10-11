"use client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function PostModal({ children, title }: { children: ReactNode; title: string }) {
  const router = useRouter();
  return <Sheet open onOpenChange={(open) => { if (!open) router.back(); }}><SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-3xl"><SheetHeader><SheetTitle>{title}</SheetTitle></SheetHeader><div className="px-4 pb-6">{children}</div></SheetContent></Sheet>;
}
