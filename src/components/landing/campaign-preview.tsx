"use client";

import { useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { CampaignLandingCopy } from "@/i18n/campaign-landing-types";
import { BrandMark } from "@/components/brand-logo";
import { AiIcon } from "@/components/ai-icon";
import { trackLandingEvent } from "@/lib/landing-measurement";
import "./campaign-preview.css";

type DemoCopy = CampaignLandingCopy["demo"];
type PreviewCopy = CampaignLandingCopy["preview"];
const SOURCE_POST = {
  url: "https://x.com/elonmusk/status/2007731379342291029",
  profile: "https://x.com/elonmusk",
  dateTime: "2026-01-04T08:30:37Z",
  text: "Just released a major upgrade to @Grok Imagine!\n\nAnother major upgrade coming in 3 weeks.",
} as const;

export function CampaignPreview({ locale, copy, demo }: { locale: Locale; copy: PreviewCopy; demo: DemoCopy }) {
  const [review, setReview] = useState<"individual" | "bulk">("individual");
  const [account, setAccount] = useState(0);
  const [drafts, setDrafts] = useState(() => [...demo.drafts]);
  const sourceDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(SOURCE_POST.dateTime));
  const started = useRef(false);
  const completed = useRef(false);
  const shownDrafts = review === "individual" ? [account] : [0, 1, 2];

  function startDemo() {
    if (started.current) return;
    started.current = true;
    trackLandingEvent("demo_start", "/");
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
  function editDraft(index: number, text: string) {
    setDrafts((current) => current.map((draft, draftIndex) => draftIndex === index ? text : draft));
  }

  return (
    <section id="campaign-opportunity" className="campaign-preview" lang={locale} aria-labelledby="campaign-preview-title">
      <div className="campaign-preview__frame">
        <header className="campaign-preview__topbar"><div className="campaign-preview__brand" aria-hidden="true"><BrandMark size={23} className="campaign-preview__brand-mark" /><span>ispatla.tr</span></div></header>
        <div className="campaign-preview__layout">
          <div className="campaign-preview__topic-card">
            <article className="campaign-preview__source-card" lang="en">
              <div className="campaign-preview__source-head">
                <a href={SOURCE_POST.profile} target="_blank" rel="noopener noreferrer">𝕏 @elonmusk</a>
                <time dateTime={SOURCE_POST.dateTime}>{sourceDate}</time>
              </div>
              <blockquote dir="ltr">{SOURCE_POST.text}</blockquote>
              <a className="campaign-preview__source-link" href={SOURCE_POST.url} target="_blank" rel="noopener noreferrer">{demo.sourceLinkLabel}<span aria-hidden="true"> ↗</span></a>
            </article>
            <p className="campaign-preview__overline">{demo.topicLabel}</p>
            <h2 id="campaign-preview-title">{demo.topicTitle}</h2>
            <p>{demo.topicBrief}</p>
          </div>
          <aside className="campaign-preview__brief">
            <div className="campaign-preview__section-head campaign-preview__brief-head"><h3>{demo.categoryLabel}</h3></div>
            <div className="campaign-preview__account-select" role="group" aria-label={demo.categoryLabel}>{copy.roles.map((role, index) => <button key={role} type="button" aria-pressed={account === index} onClick={() => changeAccount(index)}>{role}</button>)}</div>
            <p className="campaign-preview__fit-label">{demo.fitLabel}</p><p className="campaign-preview__fit-reason" aria-live="polite">{demo.fitReasons[account]}</p>
            <div className="campaign-preview__ai-heading"><AiIcon size={17} aria-hidden="true" /><h3>{demo.afterLabel}</h3></div>
            <div className="campaign-preview__drafts" aria-live="polite">
              {shownDrafts.map((index) => <div className="campaign-preview__draft-edit" key={index}>
                <label className="campaign-preview__edit-label" htmlFor={`campaign-draft-${locale}-${index}`}>{copy.roles[index]} ⁜ {demo.editLabel}</label>
                <textarea id={`campaign-draft-${locale}-${index}`} value={drafts[index]} onChange={(event) => editDraft(index, event.currentTarget.value)} />
              </div>)}
            </div>
            <div className="campaign-preview__review"><span className="campaign-preview__review-label">{copy.reviewLabel}</span><div className="campaign-preview__review-switch" role="group" aria-label={copy.reviewLabel}>
              <button type="button" aria-pressed={review === "individual"} onClick={() => changeReview("individual")}>{copy.individual}</button>
              <button type="button" aria-pressed={review === "bulk"} onClick={() => changeReview("bulk")}>{copy.bulk}</button>
            </div></div>
            <p className="campaign-preview__review-note">{review === "individual" ? copy.individualNote : copy.bulkNote}</p>
          </aside>
        </div>
      </div>
    </section>
  );
}
