import {expect,test} from 'bun:test';
import {createPreviewDrafts,updatePreviewDraft,approvePreviewDrafts,restorePreviewDraft} from '../src/components/landing/campaign-preview-state';
import {getCampaignLandingCopy} from '../src/i18n/campaign-landing';
import {previewActions} from '../src/i18n/campaign-preview-actions';
import {LOCALES} from '../src/i18n/config';

test('the Turkish slogan remains a verb rather than a domain brand substitution',()=>{
 const copy=getCampaignLandingCopy('tr');
 expect(`${copy.headline} ${copy.headlineAccent}`).toBe('Algoritmaya tapma. İspatla.');
 for(const locale of LOCALES){
  const localized=getCampaignLandingCopy(locale);
  expect(`${localized.headline} ${localized.headlineAccent}`).not.toContain('ispatla.tr');
  for(const value of Object.values(previewActions[locale]))expect(value.trim().length).toBeGreaterThan(0);
 }
});
test('approval belongs to exact text; changing one draft leaves other approvals and originals intact',()=>{
 const initial=createPreviewDrafts(['first','second','third']);
 const approved=approvePreviewDrafts(initial,[0,1,2]);
 const edited=updatePreviewDraft(approved,1,'visitor edit');
 expect(edited).toEqual([{text:'first',approved:true},{text:'visitor edit',approved:false},{text:'third',approved:true}]);
 expect(initial.every(draft=>!draft.approved)).toBe(true);
 expect(updatePreviewDraft(approved,1,'second')[1].approved).toBe(true);
 expect(restorePreviewDraft(edited,1,'second')[1]).toEqual({text:'second',approved:false});
});
test('bulk approval skips empty drafts and preserves editable content',()=>{
 const drafts=createPreviewDrafts(['hello','   ','world']);
 const next=approvePreviewDrafts(drafts,[0,1,2]);
 expect(next.map(draft=>draft.approved)).toEqual([true,false,true]);
 expect(next.map(draft=>draft.text)).toEqual(['hello','   ','world']);
});
