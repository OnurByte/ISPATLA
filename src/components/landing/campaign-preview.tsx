"use client";

import { useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { CampaignLandingCopy } from "@/i18n/campaign-landing-types";
import { BrandText } from "@/components/brand-text";
import { AiIcon } from "@/components/ai-icon";
import { CampaignDraftCard } from "./campaign-draft-card";
import { previewActions } from "@/i18n/campaign-preview-actions";
import { SOURCE_POST, createPreviewDrafts, updatePreviewDraft, approvePreviewDrafts, restorePreviewDraft } from "./campaign-preview-state";
import { trackLandingEvent } from "@/lib/landing-measurement";
import "./campaign-preview.css";

type DemoCopy = CampaignLandingCopy["demo"];
type PreviewCopy = CampaignLandingCopy["preview"];


export function CampaignPreview({ locale, copy, demo }: { locale: Locale; copy: PreviewCopy; demo: DemoCopy }) {
  const [review, setReview] = useState<"individual" | "bulk">("individual");
  const [account, setAccount] = useState(0);
  const [drafts, setDrafts] = useState(() => createPreviewDrafts(demo.drafts));
  const [copied, setCopied] = useState<{index:number;text:string}|null>(null);
  const [copyError, setCopyError] = useState("");
  const actions = previewActions[locale];
  const approvedCount = drafts.filter(draft => draft.approved).length;
  const number = new Intl.NumberFormat(locale);
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
    setReview(next);
  }
  function changeAccount(next: number) {
    if (next === account) return;
    startDemo();
    setAccount(next);
  }
  function editDraft(index: number, text: string) {
    startDemo();
    setCopyError("");
    setDrafts(current => updatePreviewDraft(current,index,text));
  }
  function approve(indices: number[]) {
    if (!indices.some(index => drafts[index]?.text.trim() && !drafts[index].approved)) return;
    startDemo();
    setDrafts(current => approvePreviewDrafts(current,indices));
    if (!completed.current) {
      completed.current = true;
      trackLandingEvent("demo_complete", "/");
    }
  }
  function restore(index: number) {
    setCopyError("");
    setCopied(null);
    setDrafts(current => restorePreviewDraft(current,index,demo.drafts[index]));
  }
  async function copyDraft(index: number, text: string) {
    startDemo();
    setCopyError("");
    try {
      await navigator.clipboard.writeText(text);
      setCopied({index,text});
    } catch { setCopyError(actions.copyFailed); }
  }

  return (
    <section id="campaign-opportunity" className="campaign-preview" lang={locale} aria-labelledby="campaign-preview-title">
      <div className="campaign-preview__frame">
        <header className="campaign-preview__topbar"><div className="campaign-preview__brand" aria-hidden="true"><BrandText text="ispatla.tr" /></div></header>
        <div className="campaign-preview__layout">
          <div className="campaign-preview__topic-card">
            <article className="campaign-preview__source-card">
              <div className="campaign-preview__source-head">
                <a href={SOURCE_POST.profile} target="_blank" rel="noopener noreferrer">𝕏 @elonmusk</a>
                <time dateTime={SOURCE_POST.dateTime}>{sourceDate}</time>
              </div>
              <blockquote lang="en" dir="ltr">{SOURCE_POST.text}</blockquote>
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
            <div className="campaign-preview__drafts">
              {shownDrafts.map(index => <CampaignDraftCard key={index} locale={locale} index={index} role={copy.roles[index]} editLabel={demo.editLabel}
                draft={drafts[index]} original={demo.drafts[index]} actions={actions} copied={copied?.index===index && copied.text===drafts[index].text}
                onEdit={editDraft} onApprove={approve} onRestore={restore} onCopy={(index,text)=>{void copyDraft(index,text);}} />)}
            </div>
            <div className="campaign-preview__review"><span className="campaign-preview__review-label">{copy.reviewLabel}</span><div className="campaign-preview__review-switch" role="group" aria-label={copy.reviewLabel}>
              <button type="button" aria-pressed={review === "individual"} onClick={() => changeReview("individual")}>{copy.individual}</button>
              <button type="button" aria-pressed={review === "bulk"} onClick={() => changeReview("bulk")}>{copy.bulk}</button>
            </div></div>
            <div className="campaign-preview__review-result">
              <span role="status">{number.format(approvedCount)}/{number.format(drafts.length)} ⁜ {actions.approved}</span>
              {review === "bulk" && <button className="campaign-preview__approve-all" type="button" disabled={!drafts.some(draft=>!draft.approved&&draft.text.trim())} onClick={()=>approve([0,1,2])}>{actions.approveAll}</button>}
            </div>
            {copyError && <p className="campaign-preview__copy-error" role="status">{copyError}</p>}
            <p className="campaign-preview__review-note">{review === "individual" ? copy.individualNote : copy.bulkNote}</p>
          </aside>
        </div>
      </div>
    </section>
  );
}
