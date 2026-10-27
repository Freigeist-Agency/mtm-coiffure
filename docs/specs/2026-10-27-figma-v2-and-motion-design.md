# MTM Coiffure — Figma v2 layout + motion

Date: 2026-10-27 · Branch: `feat/figma-v2-motion` · Ships as a PR into `main` (GitHub Pages, github.io URL). The user merges.

## Intent

The site was built from an older copy of the Figma file. The user has revised the design and
added motion intent: a loader, two infinite carousels, a pinned locations section, a stacked
news section and a scroll-driven image orbit. The goal is to bring the whole site up to the new
file and add that motion, so the site feels like a premium salon rather than a static template.

## Source of truth

Figma file `YyEL9DKmSpeoCDZfqbfjTp` ("MTM-Coiffure (Copy)"), page `0:1`. (The older file
`HUpU7yN97sC5TAX0lglWbJ` named in README.md is superseded.)

| What | Desktop (1440) | Mobile (450) |
|---|---|---|
| Home page | `64:2` | `76:222` |
| Loader frame 1 (counter) | `92:10` | `92:50` |
| Loader frame 2 (reveal) | `92:40` | `92:55` |
| Nav | `96:142` | `96:154` |
| Footer | `103:14` (inside 64:2) | inside 76:222 |

Home sections in `64:2`, top to bottom: Hero video `66:8`, Hero Header `73:59`, Introduction
`73:60`, Services `73:3` (holds the diamond image ring around "Die besten Haarschnitte im
Oberbergischen." + Termin Buchen), About `73:48` ("Wir sind MTM Coiffure." + 3 square team
photos), Location Gallery `73:61` (3 × 460² photos), Locations `73:74` ("Standorte.",
"Nümbrecht" label + two 16:9 photos 1147×645), Social Media `73:122` (header + 4 placeholder
cards 352×617), Content `75:194` (News & Ankündigungen, 2 announcement cards), Frame 35
`101:53` (1440×834 placeholder block = the video), Footer `103:14`.

Ignore everything else on the canvas (icon studies, loose photos, button exports, the narrow
"Rectangle 37/38" strips). Loose photos may be used as image sources.

## Goals

1. **Layout update (whole site).** Rebuild the home page to match `64:2` / `76:222`. Apply the
   new Nav and Footer to every page (index, impressum, datenschutz, 404,
   locations/nuembrecht, locations/waldbroel). Subpages otherwise keep their content.
   `css/tokens.css` is updated from the new file.
2. **Loader** — plays on **every load of the home page only** (not on subpages); all eases `sine.inOut`.
   - Frame 1 (`92:10`): black screen, white dome at the top with the sand glow, counter at the
     bottom counting **0 → 100**; each new number rolls in (enters from below, the old one
     leaves upward).
   - Frame 2 (`92:40`): at 100, the white dome moves up and out, then the black panel moves up
     so its curved bottom edge becomes the circle/dome shape, uncovering the page.
3. **Infinite carousels** — Social Media cards and the team photos (About). Both:
   - loop forever, **clickable** (click a card to bring it to the centre; prev/next by clicking
     the side cards; keyboard arrows when focused),
   - cards **widen and skew toward the outer edges**, with a frosted-glass (backdrop blur)
     strip on each side that distorts what passes under it.
   - Social cards stay grey placeholders. Team carousel: add more photos cropped to **1:1** from
     the file's DSC photos / `assets/`.
4. **Locations (Nümbrecht, 16:9)** — "Nümbrecht" label and the Termin Buchen button stay
   pinned (sticky) on the left while the two 16:9 photos scroll past.
5. **News stack** — the two announcement cards and the video block pin and stack on top of each
   other as you scroll; each covered layer scales down slightly and lowers its opacity for
   depth. The video is a placeholder (same block as Frame 35) until a file is supplied.
6. **Image orbit** around the Services CTA — same mechanism as Freigeist's orbit-assembly:
   images come in from the sides, start **larger** and scale down as they settle onto the ring,
   then the ring rotates. Everything is **scroll-linked** (scrub), not time-based.

## Non-goals

- Skewed-copy reference frames (ignored for now, per user).
- Real social media embeds; real video file.
- Figma → code sync automation (separate research).

## Anti-goals (fails even if it "works")

- Loader blocks content forever if JS fails → content must render without JS; the loader
  is added by JS and removed on completion or after a hard timeout.
- Any animation broken or clipped on mobile (375 / 768 / 1440 all must work).
- Two copies of GSAP on a page, or a CDN script loaded twice.
- The existing logo menu (`css/menu.css`, `js/menu.js`) regresses.

## Constraints

- Plain HTML/CSS/JS, no build step, relative paths (GitHub Pages under `/mtm-coiffure/`).
- GSAP **3.12.5** from cdnjs (already loaded for the menu) + ScrollTrigger **3.12.5** from cdnjs,
  each loaded once per page.
- `prefers-reduced-motion: reduce`: loader skips to the end in ≤ 300ms, carousels don't
  auto-animate distortion, orbit shows the formed ring statically, stack/sticky become plain flow.
- Font: Geom (Google Fonts) as today.

## Decided by the user

Carousel clickable · loader every page load · ignore skewed copies · crop extra team photos to
1:1 · social cards stay placeholders · Nümbrecht label + button sticky · cards+video stack with
opacity depth, video placeholder · orbit follows scroll · loader reading (counter rolls, dome up,
black panel curves up) correct · update the whole site · built by Claude + Claude subagents,
no agy.

## Claude's calls (user can override)

- Carousel built on GSAP (the documented `horizontalLoop` helper pattern) rather than a carousel
  library — GSAP is already on the page; one animation system.
- Edge distortion values: max `skewY` ±8°, max `scaleX` 1.25 at the outer edge, glass strips
  12vw wide with `backdrop-filter: blur(12px)`. Tuned in vw/vh units.
- Loader timing: counter 2.0s, dome up 0.6s, panel reveal 0.9s.
- Stack: covered layer → `scale 0.92`, `opacity 0.35`.
- Orbit entry: images start at scale 1.6 from off-screen left/right, settle at 1.0; ring rotates
  ~90° over the section's scroll length.
- Mobile carousels: one centred card with partial neighbours; glass strips 8vw.

## Settled details (from the builder check)

- **Loader without JS:** the loader markup is in each page's HTML, but it only shows when an
  inline `<head>` script has added `html.js`, so there is no flash before the black screen and
  no-JS visitors see the page. A hard timeout of 6s removes it whatever happens. It plays on
  every load of **index.html only** (user, 2026-10-27).
- **Carousels are click-only** (user said "clickable"; no autoplay). The loop is infinite in
  both directions. Edge cards stop being square while they are distorted; that is the effect.
  Team carousel: 8 photos in total. Reduced-motion and no-JS fallback: a plain horizontal
  scroll-snap row with no distortion.
- **Pinning:** no Lenis, native scroll. Nümbrecht and the news stack use CSS
  `position: sticky`. ScrollTrigger only reads scroll progress to drive scale and opacity, and
  there are no pin-spacers. The stack's scroll length is about 1 viewport per layer.
- **Stack order:** card 1 → card 2 → video placeholder (Frame 35), with the video as the third
  layer. There is no separate video section after it.
- **Orbit:** uses the images in the Figma ring (8: 3 above the heading, 2 beside it, 3 below).
  It scrubs as the section passes through, with no pin. Photos keep their Figma tilt and
  counter-spin so they stay upright as the ring turns (the orbit-assembly face layer). Mobile
  follows the arrangement in `76:222`, scaled down.
- **Subpages** reuse the home nav and footer unchanged; the file has no subpage frames.

## Booking links (user, 2026-10-27)

Planity, one per salon:
- Nümbrecht: https://www.planity.com/de-DE/mtm-coiffure-by-mo-51588-numbrecht
- Waldbröl: https://www.planity.com/de-DE/mtm-coiffure-by-abdul-51545-waldbrol

Location-specific Termin Buchen buttons (the "in Nümbrecht" / "in Waldbröl" buttons and the
buttons on `locations/nuembrecht.html` / `locations/waldbroel.html`) link straight to that
salon's Planity page (`target="_blank" rel="noopener"`). Generic Termin Buchen buttons (hero,
nav, menu, CTA) keep linking to `#standorte`, so the visitor picks a salon there (Claude's call).
This resolves the `TODO(content): real booking URL` notes.

## Prior art

| Candidate | Licence | Health | Cost | Verdict |
|---|---|---|---|---|
| GSAP 3.12.5 + ScrollTrigger (cdnjs) | GSAP standard licence (free) | maintained | free | **Use** — already on site |
| GSAP `horizontalLoop` helper (gsap.com docs) | GSAP | maintained | free | **Use** for both carousels |
| Freigeist `code/orbit-assembly/` (own code) | ours | shipped 2026-08 | free | **Adapt** for the orbit (polar arm + card layers) |
| Embla Carousel | MIT | active | free | Rejected: second motion system; distortion still custom |
| Swiper | MIT | active | free | Rejected: heavy; effects don't match the edge distortion |

## Verification

Playwright (from `../../studio/node_modules` or the monorepo root) at 375, 768, 1440:
loader runs to completion and removes itself; carousels loop both ways and respond to clicks;
sticky label stays in view across the 16:9 photos; stack layers' opacity/scale change with
scroll; orbit images move with scroll (sample 5 scroll positions, positions differ, all inside
the viewport at the end). Real wheel scroll, not `scrollTo` only. No console errors. Compare
static layout against Figma screenshots of `64:2` / `76:222` section by section.
