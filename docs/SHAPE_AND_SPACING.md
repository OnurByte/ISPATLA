# Shape and spacing standard

## Evidence and limits

[Bar & Neta (2006), Humans Prefer Curved Visual Objects](https://www.psychologicalscience.org/journals/psychological-science/j.1467-9280.2006.01759.x/) found a preference for curved rather than sharp contours in their stimuli. It does not identify an optimal CSS radius, establish familiarity with this interface, or prove higher conversion. [Aesthetic sensitivity to curvature in real objects and abstract designs (2019)](https://pubmed.ncbi.nlm.nih.gov/31146089/) reports substantial individual variation in curvature preference.

[Reber, Schwarz & Winkielman (2004)](https://psy2.ucsd.edu/~pwinkiel/reber-schwarz-winkielman-beauty-PSPR-2004.pdf) propose processing fluency as an account of aesthetic response, including repetition, contrast and prototypicality. Applying that account to consistent controls is a design inference, not a tested result for ispatla.tr.

[Kubovy, Holcombe & Wagemans (1998)](https://www.sciencedirect.com/science/article/pii/S0010028597906733) quantify grouping by proximity in dot lattices. Relative separation helps communicate groups; their study does not prescribe a 4px or 8px UI grid.

## Implementation decisions

Preserve Libron, paper/carbon/cobalt, flat surfaces, editorial hierarchy and the supplied marks. Use restrained, repeatable corners rather than a page of pill-shaped cards. These numeric choices are engineering/design decisions informed by the literature, not psychological constants.

| Role | Radius | Usage |
| --- | --- | --- |
| Small detail | 4px | Checkbox and small visual detail |
| Compact element | 6px | Badges, small buttons and menu items |
| Control | 8px | Normal button, input, selector and editable draft |
| Surface | 12px | Cards, preview panels and MCP panel |
| Outer frame | 16px | Overall interactive preview and larger enclosing surfaces |

Circle geometry remains appropriate for avatars and progress markers. Structural dividers and the wordmark remain unrounded. Nested segmented controls use 12px outer / 8px inner corners with a 4px inset.

Tailwind and custom CSS share these values through globals.css tokens. Layout spacing uses the existing 4px unit: 8px inline gaps, 12px nearby-content gaps, 16–24px inner padding, 24–32px group gaps, and 48–80px section space as viewport/content require. Text sizes, line heights, one-pixel borders and circular shapes are not snapped to a layout grid. Preserve 44px hit targets where already required.

The hero has no empty eyebrow slot: the heading starts at the section inset. Public document content and header use the same mobile gutter. On narrow screens the preview stacks, selectors expand to rows, and review controls wrap.
