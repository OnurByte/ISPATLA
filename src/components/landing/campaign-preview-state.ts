export type PreviewDraft = { text: string; approved: boolean };
export const SOURCE_POST = {
  url: 'https://x.com/elonmusk/status/2007731379342291029',
  profile: 'https://x.com/elonmusk',
  dateTime: '2026-01-04T08:30:37Z',
  text: 'Just released a major upgrade to @Grok Imagine!\n\nAnother major upgrade coming in 3 weeks.',
} as const;
export function createPreviewDrafts(texts: readonly string[]): PreviewDraft[] {
  return texts.map(text => ({text,approved:false}));
}
export function updatePreviewDraft(drafts: PreviewDraft[], index: number, text: string): PreviewDraft[] {
  return drafts.map((draft,i) => i===index && text!==draft.text ? {text,approved:false} : draft);
}
export function approvePreviewDrafts(drafts: PreviewDraft[], indices: readonly number[]): PreviewDraft[] {
  return drafts.map((draft,i) => indices.includes(i) && draft.text.trim() ? {...draft,approved:true} : draft);
}
export function restorePreviewDraft(drafts: PreviewDraft[], index: number, original: string): PreviewDraft[] {
  return drafts.map((draft,i) => i===index ? {text:original,approved:false} : draft);
}
