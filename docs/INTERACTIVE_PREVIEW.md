# Interactive preview

## Intent and research

Keep the original slogan verbatim: “Algoritmaya tapma. İspatla.” The second sentence is a verb, not a reference to the domain brand.

The existing preview let visitors edit drafts and switch account/view, but did not let them complete a meaningful review, recover the original text or take their text away. It also recorded completion merely for toggling the view.

[Microsoft Research’s Human–AI Interaction Guidelines](https://www.microsoft.com/en-us/research/?p=564561) motivate efficient correction, contextual explanations, remembering recent interactions and conveying action consequences. [NN/g’s visibility-of-system-status guidance](https://www.nngroup.com/articles/visibility-system-status/) supports clear feedback after actions. These are design principles, not evidence that this particular change improves conversion; no participant study or conversion uplift is claimed.

## Implemented behavior

- Each account retains its own editable text and exact-text approval while switching accounts or individual/bulk views.
- Changing approved text invalidates only that draft’s approval. An unchanged edit preserves approval. Empty text cannot be approved.
- Individual approval and optional bulk approval are real local state changes. Bulk approval skips empty drafts.
- Restore resets one draft and its approval without discarding other accounts’ work.
- Copy writes the current text to the clipboard, shows success only after it succeeds, and provides localized recovery text on failure. Feedback is tied to the copied text so an asynchronous copy cannot label a different edit as copied.
- Completion analytics fire on the first meaningful approval, not on a view toggle. No publishing, provider call or external account mutation is performed by these controls.
- Larger body/control text, 44px action targets, labeled editors, contextual button labels and status announcements support accessible interaction. The entire editing area is not a live region, avoiding announcements on each keystroke.

## Structure

`campaign-preview-state.ts` owns pure draft transformations and the preserved dated source snapshot. `campaign-draft-card.tsx` renders a controlled editor and actions. `campaign-preview.tsx` coordinates account/review selection, clipboard feedback and analytics. `campaign-preview-actions.ts` supplies all 20 locales.

All inline brand stamps now pair the original site mark with the outlined Libron wordmark, using the same visible-ink centering as navigation. This avoids reintroducing font-line-box alignment errors in buttons and prose. This brand treatment never applies to the hero slogan.
