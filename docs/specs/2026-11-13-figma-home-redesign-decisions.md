# Home page: Figma vs live, decisions (2026-11-13)

Decided by the cofounder after a section-by-section comparison of the Figma frame "Desktop - 1" (plus "Nav" and "Footer")
with the live site at 1440 px. Comparison page: https://claude.ai/artifact/3x75VX4yNUgvXYHmb2xRgm

## Layout and styling

| Section | Decision |
|---|---|
| Hero | Use Figma: the salon video (client clip IMG_3967) under a 32% black layer, white text, large "MTM Coiffure." along the bottom edge, no curve. Note: the earlier hero curve was a client request; the cofounder chose Figma over it. Built 2026-11-13. |
| About | Use Figma: Google rating card (4.7, 171 Bewertungen, Termin Buchen), large text over the faded MTM logo, no heading. The team photo row moves out (see Intro). |
| Intro | Use Figma: white text on black, placed after the services ring. Team photo row follows it, on black. |
| Headings | Figma's display lettering for "MTM Coiffure.", "Standorte.", "Folge uns auf Social Media.", "News & Ankündigungen.". The real text must stay in the HTML for search engines and screen readers. Correction (2026-11-13): the font is Badeen Display (Google Fonts, SIL OFL), not Lemon, so it ships as a web font with real text; no SVG needed. |
| Locations | Use Figma: centred heading with the button below, salon interior photo on both cards, small names on the right, no buttons on the cards. |
| Review card | Keep live: real Google reviews, not Figma's Lorem ipsum. |
| News | Use Figma: two cards side by side. |

## Motion

| Animation | Decision |
|---|---|
| Loader | Keep |
| Nav hides on scroll (js/nav-hide.js) | Remove: nav always visible |
| Curved edges (js/arc-scroll.js) | Keep, with their scroll movement, only where Figma draws a curve: over the closing team photo and the dome above the footer. Remove the others (under the hero, around Standorte). |
| Checkerboard block transitions | New: build them at the three Figma "transition" frames (services to intro, Standorte to review card, news to team photo). |
| Services orbit | Keep |
| Intro word reveal | Keep, recoloured for white on black |
| Team photo hover gallery | Keep, in its new place after the intro |
| Standorte stack | Keep |
| Review rotator | Keep |
| Social radial slider | Keep |
| Team photo pin | Keep |
| News stack (js/stack.js) | Phone only (cards one above the other); side by side and still on tablet and desktop |

Every motion change follows the workspace motion-checklist (375 / 768 / 1440 and prefers-reduced-motion).

## Found while building the layout (2026-11-13)

- **Curves.** Figma keeps only the footer's two domes (the white one with the logo, and the black one). Where the live site had a curve
  over the top of the closing team photo, Figma has white checkerboard blocks (257:77); under Standorte it has black blocks (278:122).
  So the curves removed are: under the hero, over Standorte, before Social and over the team photo. The footer domes stay.
- **Checkerboards** (257:112, 278:122, 257:77) are built as still graphics in their Figma places; their animation comes later.
- **Order** now follows Figma: hero, about, services, intro (on black), team photos, Standorte, review card, social media, news, team photo, footer.
- **Location cards** show the salon video (Figma fills them with a video), the name on the right. The per-salon Planity buttons are gone
  from the cards (Figma has none); booking per salon is on the salon pages, which the card names link to.
- **Nav over the hero**: transparent with a white logo (assets/logo-nav-white.png, made from logo-nav.png; Figma has no white logo, so ask the designer for one).
- **No phone or tablet design in Figma** for the new layout: phone and tablet were adapted from the desktop design.
