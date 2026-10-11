"use client";

import { useId, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function PublicHeaderNav({ brand, children, label }: { brand: ReactNode; children: ReactNode; label: string }) {
  const panelId = useId();
  return <Collapsible className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-4 sm:px-8">
    {brand}
    <CollapsibleTrigger render={<Button variant="outline" size="icon" />} aria-label={label} aria-controls={panelId} className="size-11 lg:hidden">
      <Menu aria-hidden="true" />
    </CollapsibleTrigger>
    <CollapsibleContent id={panelId} keepMounted hidden={false} className="col-span-2 data-[closed]:hidden lg:col-span-1 lg:block!">
      <nav aria-label={label} className="mt-3 flex min-w-0 flex-col gap-2 border-t border-border pt-3 lg:mt-0 lg:flex-row lg:items-center lg:border-0 lg:pt-0">
        {children}
      </nav>
    </CollapsibleContent>
  </Collapsible>;
}
