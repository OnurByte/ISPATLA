import { Check, Copy, RotateCcw } from 'lucide-react';
import type { Locale } from '@/i18n/config';
import type { PreviewActions } from '@/i18n/campaign-preview-actions';
import type { PreviewDraft } from './campaign-preview-state';

type Props = {
 locale:Locale; index:number; role:string; editLabel:string; draft:PreviewDraft; original:string;
 actions:PreviewActions; copied:boolean;
 onEdit:(index:number,text:string)=>void; onApprove:(indices:number[])=>void;
 onRestore:(index:number)=>void; onCopy:(index:number,text:string)=>void;
};
export function CampaignDraftCard({locale,index,role,editLabel,draft,original,actions,copied,onEdit,onApprove,onRestore,onCopy}:Props) {
 const edited=draft.text!==original;
 const status=draft.approved?actions.approved:edited?actions.edited:actions.draft;
 const id=`campaign-draft-${locale}-${index}`;
 return <div className="campaign-preview__draft-edit" data-approved={draft.approved}>
   <div className="campaign-preview__draft-heading">
     <label className="campaign-preview__edit-label" htmlFor={id}>{role} ⁜ {editLabel}</label>
     <span className="campaign-preview__draft-status" role="status">{draft.approved && <Check size={14} aria-hidden="true" />}{status}</span>
   </div>
   <textarea id={id} value={draft.text} onChange={event=>onEdit(index,event.currentTarget.value)} />
   <div className="campaign-preview__draft-actions">
     <button className="campaign-preview__approve" type="button" disabled={draft.approved||!draft.text.trim()} aria-label={`${draft.approved?actions.approved:actions.approve} ⁜ ${role}`} onClick={()=>onApprove([index])}><Check size={15} aria-hidden="true" />{draft.approved?actions.approved:actions.approve}</button>
     <button type="button" disabled={!draft.text.trim()} aria-label={`${copied?actions.copied:actions.copy} ⁜ ${role}`} onClick={()=>onCopy(index,draft.text)}><Copy size={15} aria-hidden="true" />{copied?actions.copied:actions.copy}</button>
     <button type="button" disabled={!edited&&!draft.approved} aria-label={`${actions.restore} ⁜ ${role}`} onClick={()=>onRestore(index)}><RotateCcw size={15} aria-hidden="true" />{actions.restore}</button>
   </div>
 </div>;
}
