"use client";

import { useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { CampaignLandingCopy } from "@/i18n/campaign-landing-types";
import { BrandMark } from "@/components/brand-logo";
import { AiIcon } from "@/components/ai-icon";
import { trackLandingEvent } from "@/lib/landing-measurement";
import "./campaign-preview.css";

type Period = 7 | 30 | 90;

const DEMO = {
  7: {
    impressions: 12840, engagement: 4.8, followers: 38,
    series: [
      [17, 25, 22, 42, 36, 54, 51, 74],
      [10, 18, 16, 28, 41, 38, 59, 67],
      [8, 12, 20, 17, 29, 34, 42, 57],
    ],
    accounts: [4280, 4920, 3640],
  },
  30: {
    impressions: 38210, engagement: 3.9, followers: 96,
    series: [
      [12, 20, 34, 29, 46, 42, 63, 81],
      [8, 15, 27, 38, 31, 55, 49, 71],
      [5, 18, 16, 25, 39, 33, 51, 62],
    ],
    accounts: [13240, 14610, 10360],
  },
  90: {
    impressions: 98420, engagement: 4.2, followers: 221,
    series: [
      [8, 16, 21, 33, 27, 45, 58, 86],
      [6, 13, 19, 26, 40, 36, 55, 73],
      [4, 11, 16, 22, 31, 29, 44, 65],
    ],
    accounts: [35420, 37210, 25790],
  },
} as const;

const CHART_COLORS = ["#76e2c0", "#8298ff", "#c3b4ff"] as const;

/** Create a chart line from normalized points. Exported for finite-value coverage. */
export function campaignChartPath(points: readonly number[]): string {
  const validPoints = points.filter(Number.isFinite);
  if (validPoints.length < 2) return "";
  return validPoints.map((value, index) => {
    const x = 38 + (index * 684) / (points.length - 1);
    const y = 220 - (Math.max(0, Math.min(100, value)) * 1.78);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

export function CampaignPreview({ locale, copy }: { locale: Locale; copy: CampaignLandingCopy["preview"] }) {
  const [period, setPeriod] = useState<Period>(30);
  const [review, setReview] = useState<"individual" | "bulk">("bulk");
  const [account, setAccount] = useState(0);
  const started = useRef(false);
  const completed = useRef(false);
  const demo = DEMO[period];
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const dayFormat = new Intl.NumberFormat(locale, { style: "unit", unit: "day", unitDisplay: "short" });
  const metrics = [
    { label: copy.impressions, value: number.format(demo.impressions), tone: "mint" },
    { label: copy.engagement, value: percent.format(demo.engagement / 100), tone: "blue" },
    { label: copy.followers, value: `+${number.format(demo.followers)}`, tone: "lilac" },
  ] as const;
  const drafts = review === "individual" ? [account] : [0, 1, 2];

  function startDemo() {
    if (started.current) return;
    started.current = true;
    trackLandingEvent("demo_start", "/");
  }

  function changePeriod(next: Period) {
    if (next === period) return;
    startDemo();
    setPeriod(next);
  }

  function changeReview(next: "individual" | "bulk") {
    if (next === review) return;
    startDemo();
    if (!completed.current) {
      completed.current = true;
      trackLandingEvent("demo_complete", "/");
    }
    setReview(next);
  }

  function changeAccount(next: number) {
    if (next === account) return;
    startDemo();
    setAccount(next);
  }

  return (
    <section className="campaign-preview" lang={locale} aria-labelledby="campaign-preview-title">
      <div className="campaign-preview__frame">
        <header className="campaign-preview__topbar">
          <div className="campaign-preview__brand" aria-hidden="true"><BrandMark size={23} className="campaign-preview__brand-mark" /><span>ispatla.tr</span></div>
          <span className="campaign-preview__sample">{copy.label}</span>
        </header>

        <div className="campaign-preview__heading">
          <div>
            <p className="campaign-preview__overline">{copy.topicLabel}</p>
            <h2 id="campaign-preview-title">{copy.title}</h2>
          </div>
          <div className="campaign-preview__period" role="group" aria-label={copy.period}>
            {([7, 30, 90] as const).map((days, index) => (
              <button key={days} type="button" aria-pressed={period === days} onClick={() => changePeriod(days)}>
                <span className="campaign-preview__period-wide">{copy.days[index]}</span>
                <span className="campaign-preview__period-compact">{dayFormat.format(days)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="campaign-preview__layout">
          <div className="campaign-preview__performance">
            <div className="campaign-preview__metrics">
              {metrics.map((metric) => (
                <article className="campaign-preview__metric" key={metric.label}>
                  <span className={`campaign-preview__metric-value campaign-preview__metric-value--${metric.tone}`}>{metric.value}</span>
                  <span className="campaign-preview__metric-label">{metric.label}</span>
                </article>
              ))}
            </div>

            <figure className="campaign-preview__chart">
              <svg viewBox="0 0 760 260" role="img" aria-label={copy.chartDescription}>
                {[42, 86, 130, 174, 218].map((y) => <path key={y} d={`M38 ${y}H722`} className="campaign-preview__gridline" />)}
                {demo.series.map((series, index) => (
                  <g key={index}>
                    <path d={campaignChartPath(series)} fill="none" stroke={CHART_COLORS[index]} strokeWidth={index === 0 ? 3 : 2.5} strokeLinecap="round" strokeLinejoin="round" opacity={index === 0 ? 1 : 0.8} />
                    <circle cx="722" cy={220 - series[series.length - 1] * 1.78} r="4" fill={CHART_COLORS[index]} />
                  </g>
                ))}
              </svg>
              <figcaption className="campaign-preview__chart-caption">
                <span>{copy.chartStart}</span><span>{copy.chartEnd}</span>
              </figcaption>
            </figure>

            <div className="campaign-preview__portfolio">
              <div className="campaign-preview__section-head">
                <h3>{copy.accounts}</h3>
                <span aria-hidden="true" className="campaign-preview__account-count">03</span>
              </div>
              <div className="campaign-preview__account-list">
                {copy.roles.map((role, index) => (
                  <div className="campaign-preview__account-row" key={role}>
                    <span className={`campaign-preview__account-dot campaign-preview__account-dot--${index}`} aria-hidden="true" />
                    <span className="campaign-preview__account-name">{role}</span>
                    <span className="campaign-preview__account-total" aria-label={`${role}: ${number.format(demo.accounts[index])} ${copy.impressions}`}>
                      {number.format(demo.accounts[index])}
                    </span>
                    <svg className="campaign-preview__spark" viewBox="0 0 760 260" preserveAspectRatio="none" aria-hidden="true">
                      <path d={campaignChartPath(demo.series[index].slice(-4))} fill="none" stroke={CHART_COLORS[index]} strokeWidth="12" strokeLinecap="round" />
                    </svg>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="campaign-preview__brief">
            <div className="campaign-preview__section-head campaign-preview__brief-head">
              <h3>{copy.topicLabel}</h3>
            </div>
            <p className="campaign-preview__topic">{copy.topic}</p>
            <div className="campaign-preview__ai-heading"><AiIcon size={17} aria-hidden="true" /><h3>{copy.aiLabel}</h3></div>
            <div className="campaign-preview__review">
              <span className="campaign-preview__review-label">{copy.reviewLabel}</span>
              <div className="campaign-preview__review-switch" role="group" aria-label={copy.reviewLabel}>
                <button type="button" aria-pressed={review === "individual"} onClick={() => changeReview("individual")}>{copy.individual}</button>
                <button type="button" aria-pressed={review === "bulk"} onClick={() => changeReview("bulk")}>{copy.bulk}</button>
              </div>
            </div>
            {review === "individual" && (
              <div className="campaign-preview__account-select" role="group" aria-label={copy.accounts}>
                {copy.roles.map((role, index) => <button key={role} type="button" aria-pressed={account === index} onClick={() => changeAccount(index)}>{role}</button>)}
              </div>
            )}
            <div className="campaign-preview__drafts" aria-live="polite">
              {drafts.map((index) => (
                <article className="campaign-preview__draft" key={index}>
                  <div className="campaign-preview__draft-top"><span className="campaign-preview__draft-account">{copy.roles[index]}</span><span className="campaign-preview__draft-status"><span aria-hidden="true" />{copy.ready}</span></div>
                  <p>{copy.drafts[index]}</p>
                </article>
              ))}
            </div>
            <p className="campaign-preview__review-note">{review === "individual" ? copy.individualNote : copy.bulkNote}</p>
          </aside>
        </div>
        <p className="campaign-preview__caption">{copy.chartDescription}</p>
      </div>
    </section>
  );
}
