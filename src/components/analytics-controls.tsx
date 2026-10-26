"use client";
import {useUiText} from "@/i18n/ui-client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

type Account = { id: number; handle: string };

export function AnalyticsControls({ accounts, accountId, rangeDays }: { accounts: Account[]; accountId: number | null; rangeDays: 7 | 14 }) {
  const {t}=useUiText();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navigate = (key: "account" | "range", value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === "account" && value === "all") params.delete("account");
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  };

  return <div className="flex flex-wrap items-center gap-2">
    <Select value={accountId === null ? "all" : String(accountId)} onValueChange={(value) => navigate("account", String(value))}>
      <SelectTrigger aria-label={t('Select account details')}><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup><SelectLabel>{t('Account view')}</SelectLabel><SelectItem value="all">{t('All accounts')}</SelectItem>{accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>@{account.handle}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
    <Select value={String(rangeDays)} onValueChange={(value) => navigate("range", String(value))}>
      <SelectTrigger aria-label={t('Select analytics period')}><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup><SelectLabel>{t('Snapshot period')}</SelectLabel><SelectItem value="7">{t('Last 7 days')}</SelectItem><SelectItem value="14">{t('Last 14 days')}</SelectItem></SelectGroup></SelectContent>
    </Select>
  </div>;
}
