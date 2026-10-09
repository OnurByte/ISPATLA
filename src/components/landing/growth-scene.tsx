"use client";

import { useState } from "react";
import type { Locale } from "@/i18n/config";
import { BrandMark } from "@/components/brand-logo";
import type { SignalPressCopy } from "@/i18n/signal-press";

const labels: Record<Locale, { title: string; impressions: string; followers: string; engagement: string; draft: string }> = {
  tr: { title: "𝕏 büyüme masası", impressions: "Gösterim", followers: "Takipçi değişimi", engagement: "Etkileşim", draft: "Taslak kuyruğu" }, en: { title: "𝕏 growth desk", impressions: "Impressions", followers: "Follower change", engagement: "Engagement", draft: "Draft queue" },
  "zh-CN": { title: "𝕏 增长工作台", impressions: "展示次数", followers: "关注者变化", engagement: "互动", draft: "草稿队列" }, hi: { title: "𝕏 वृद्धि डेस्क", impressions: "इम्प्रेशन", followers: "फ़ॉलोअर में बदलाव", engagement: "एंगेजमेंट", draft: "ड्राफ़्ट कतार" },
  es: { title: "Panel de crecimiento de 𝕏", impressions: "Impresiones", followers: "Cambio de seguidores", engagement: "Interacción", draft: "Cola de borradores" }, fr: { title: "Espace de croissance 𝕏", impressions: "Impressions", followers: "Évolution des abonnés", engagement: "Interactions", draft: "File de brouillons" },
  ar: { title: "مكتب نمو 𝕏", impressions: "مرات الظهور", followers: "تغيّر المتابعين", engagement: "التفاعل", draft: "قائمة المسودات" }, bn: { title: "𝕏 বৃদ্ধি ডেস্ক", impressions: "ইমপ্রেশন", followers: "অনুসারীর পরিবর্তন", engagement: "সম্পৃক্ততা", draft: "খসড়ার সারি" },
  "pt-BR": { title: "Painel de crescimento do 𝕏", impressions: "Impressões", followers: "Variação de seguidores", engagement: "Engajamento", draft: "Fila de rascunhos" }, ru: { title: "Панель роста 𝕏", impressions: "Показы", followers: "Изменение подписчиков", engagement: "Вовлечённость", draft: "Очередь черновиков" },
  id: { title: "Meja pertumbuhan 𝕏", impressions: "Impresi", followers: "Perubahan pengikut", engagement: "Interaksi", draft: "Antrean draf" }, ur: { title: "𝕏 ترقی ڈیسک", impressions: "امپریشنز", followers: "فالوورز میں تبدیلی", engagement: "تعامل", draft: "مسودوں کی قطار" },
  de: { title: "𝕏-Wachstumsdesk", impressions: "Impressionen", followers: "Follower-Änderung", engagement: "Interaktionen", draft: "Entwurfswarteschlange" }, ja: { title: "𝕏 成長ダッシュボード", impressions: "インプレッション", followers: "フォロワーの変化", engagement: "エンゲージメント", draft: "下書きキュー" },
  sw: { title: "Dawati la ukuaji wa 𝕏", impressions: "Mionekano", followers: "Mabadiliko ya wafuasi", engagement: "Mwingiliano", draft: "Foleni ya rasimu" }, mr: { title: "𝕏 वाढ डेस्क", impressions: "इम्प्रेशन्स", followers: "फॉलोअरमधील बदल", engagement: "एंगेजमेंट", draft: "मसुद्यांची रांग" },
  te: { title: "𝕏 వృద్ధి డెస్క్", impressions: "ఇంప్రెషన్లు", followers: "ఫాలోవర్ల మార్పు", engagement: "ఎంగేజ్‌మెంట్", draft: "డ్రాఫ్ట్ క్యూ" }, ta: { title: "𝕏 வளர்ச்சி மேசை", impressions: "பார்வைகள்", followers: "பின்தொடர்பவர் மாற்றம்", engagement: "ஈடுபாடு", draft: "வரைவு வரிசை" },
  vi: { title: "Bàn tăng trưởng 𝕏", impressions: "Lượt hiển thị", followers: "Thay đổi người theo dõi", engagement: "Tương tác", draft: "Hàng đợi bản nháp" }, ko: { title: "𝕏 성장 대시보드", impressions: "노출수", followers: "팔로워 변화", engagement: "참여도", draft: "초안 대기열" },
};

export const GROWTH_DEMO = {
  7: { impressions: 12480, followers: 38, engagement: 4.8, points: [18, 31, 27, 49, 45, 65, 72] },
  30: { impressions: 38210, followers: 96, engagement: 3.9, points: [12, 40, 33, 57, 46, 62, 84] },
  90: { impressions: 98420, followers: 221, engagement: 4.2, points: [8, 22, 48, 37, 66, 56, 91] },
} as const;

export function growthPlot(points: readonly number[]) {
  const coordinates = points.map((value, index) => [35 + index * 555 / (points.length - 1), 235 - value * 2] as const);
  const line = coordinates.map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`).join(" ");
  return { coordinates, line, area: `${line} V235 H35Z` };
}

/** Explicitly synthetic campaign dashboard; period changes never imply live data. */
export function GrowthScene({ locale, copy }: { locale: Locale; copy: SignalPressCopy }) {
  const text = labels[locale];
  const [period, setPeriod] = useState<keyof typeof GROWTH_DEMO>(7);
  const sample = GROWTH_DEMO[period];
  const plot = growthPlot(sample.points);
  const number = new Intl.NumberFormat(locale);
  return <figure lang={locale} className="growth-scene relative mx-auto w-full max-w-2xl overflow-hidden border p-3 shadow-[0_28px_80px_rgba(0,0,0,.22)] sm:p-5">
    <div className="growth-grid absolute inset-0 opacity-30" aria-hidden="true" />
    <div className="growth-panel relative border p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-4">
        <div className="growth-muted flex items-center gap-2" dir="ltr" aria-label="𝕏 / İspatla"><span className="font-mono text-[22px] leading-none">𝕏</span><span className="font-mono text-sm" aria-hidden="true">/</span><BrandMark size={22} /></div>
        <span className="growth-muted border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider">{copy.issue}</span>
      </div>
      <h2 id="growth-scene-title" className="press-serif growth-ink mt-4 text-2xl sm:text-3xl">{text.title}</h2>
      <p className="growth-muted mt-2 font-mono text-[9px] font-bold uppercase tracking-wider">{copy.synthetic}</p>
      <div className="mt-4 flex gap-2" role="group" aria-label={text.title}>{([7, 30, 90] as const).map((days) => <button key={days} type="button" aria-pressed={period === days} onClick={() => setPeriod(days)} className="min-h-10 border px-3 py-2 text-xs font-medium aria-pressed:bg-[var(--growth-blue)] aria-pressed:text-[var(--growth-panel)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{new Intl.NumberFormat(locale, { style: "unit", unit: "day", unitDisplay: "short" }).format(days)}</button>)}</div>
      <div className="mt-5 grid grid-cols-3 gap-2 font-mono text-center">
        {[[number.format(sample.impressions), text.impressions, "var(--growth-mint)"], [`+${number.format(sample.followers)}`, text.followers, "var(--growth-blue)"], [new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(sample.engagement / 100), text.engagement, "var(--growth-orange)"]].map(([value, label, color]) => <div key={label} className="growth-metric border px-2 py-3"><span className="block text-xl font-bold" style={{ color }}>{value}</span><span className="growth-muted mt-1 block text-[10px] tracking-wide">{label}</span></div>)}
      </div>
      <svg viewBox="0 0 600 250" role="img" aria-label={text.title} className="mt-4 h-auto w-full">
        <defs><linearGradient id="growth-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--growth-blue)" stopOpacity=".32"/><stop offset="1" stopColor="var(--growth-blue)" stopOpacity="0"/></linearGradient></defs>
        {[35, 85, 135, 185, 235].map((y) => <path key={y} d={`M35 ${y}H590`} stroke="var(--growth-gridline)" strokeOpacity=".55" />)}
        <path d={plot.area} fill="url(#growth-fill)" />
        <path className="growth-line" d={plot.line} fill="none" stroke="var(--growth-blue)" strokeWidth="4" />
        {plot.coordinates.map(([x,y]) => <circle key={x} cx={x} cy={y} r="5" fill="var(--growth-point)" stroke="var(--growth-blue)" strokeWidth="3" />)}
      </svg>
      <div className="growth-muted mt-3 flex items-center justify-between gap-2 border-t border-white/15 pt-4 font-mono text-[9px] uppercase tracking-[.14em]"><span>{text.draft}</span><span className="growth-highlight">{copy.reason}</span></div>
    </div>
    <figcaption className="sr-only">{text.title} · {copy.issue}</figcaption>
  </figure>;
}
