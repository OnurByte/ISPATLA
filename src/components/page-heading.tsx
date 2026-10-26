import { UiBrandText } from "@/i18n/ui-client";
export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-5 border-b pb-7 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex max-w-3xl flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"><UiBrandText text={eyebrow} /></p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl"><UiBrandText text={title} /></h1>
        <p className="text-sm leading-6 text-muted-foreground"><UiBrandText text={description} /></p>
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}
