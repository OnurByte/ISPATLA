"use client";
import {useUiText} from "@/i18n/ui-client";
import { cn } from "@/lib/utils"
import { Loader2Icon } from "lucide-react"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const {t}=useUiText();
  return (
    <Loader2Icon data-slot="spinner" role="status" aria-label={t("Loading")} className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
