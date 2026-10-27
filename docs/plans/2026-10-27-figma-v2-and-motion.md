# MTM Figma v2 + Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the MTM static site up to Figma file `YyEL9DKmSpeoCDZfqbfjTp` and add the loader, two click-driven infinite carousels, the sticky Nümbrecht section, the news stack and the scroll-linked image orbit.

**Architecture:** Plain HTML/CSS/JS with no build step. Each motion feature is one JS file plus one CSS file and initialises from `window.mtmReady` (a Promise that `js/loader.js` resolves when the loader finishes, or immediately on pages without a loader). GSAP 3.12.5 + ScrollTrigger 3.12.5 come from cdnjs; pinning uses CSS `position: sticky`, and ScrollTrigger only scrubs scale, opacity and rotation.

**Tech Stack:** HTML, CSS, vanilla JS, GSAP 3.12.5 + ScrollTrigger 3.12.5 (cdnjs). Tests are Node ESM probes using Playwright from `/home/eddie/Work/Amatsima/Code/studio/node_modules/playwright` against `python3 -m http.server`.

**Spec:** `docs/specs/2026-10-27-figma-v2-and-motion-design.md`

**Figma access for implementers:** use the Figma MCP tools with fileKey `YyEL9DKmSpeoCDZfqbfjTp` and sessionId `d396bb6c-f7ae-4fe0-a797-a9e804212a20`. Load the `figma:figma-design-to-code` skill before calling `get_design_context`. Node ids are in the spec's "Source of truth" table.

## Global Constraints

- GSAP **3.12.5** and ScrollTrigger **3.12.5** from `https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/`; each script tag appears **once** per page.
- All motion eases are `sine.inOut`.
- Relative paths only (the site is served under `/mtm-coiffure/` on GitHub Pages).
- Every feature works at **375, 768 and 1440** px wide, with no horizontal page overflow.
- `prefers-reduced-motion: reduce` → static fallbacks as the spec describes.
- Content renders with JS disabled.
- Do not change `css/menu.css` or `js/menu.js` except the booking-link line in Task 5.
- Tunable sizes are in vw/vh/vmin, never fixed px.
- No AI attribution in commits, comments or files. Commit as the user, with plain messages.

## Review Focus

1. **Deep link through the loader.** Opening `index.html#standorte` (every generic Termin Buchen button on a subpage links there) must end with `#standorte` in view after the loader, not at the top. → Task 3 test `deepLinkLandsOnStandorte`.
2. **Rapid clicks on a carousel.** Six fast clicks on the next card must leave no gaps in the track and a consistent index. → Task 4 test `rapidClicksNoGaps`.
3. **Resize after init.** Changing the viewport from 1440 to 375 after load must re-measure the carousels and the orbit (no off-screen ring, no stale distortion). → Task 4 `resizeRemeasures`, Task 7 `orbitResizeInsideViewport`.
4. **Slow or hidden load.** If assets stall or the tab is hidden, the loader still clears within 6s and `mtmReady` resolves. → Task 3 test `hardTimeoutClears`.
5. **Keyboard users.** Carousels are focusable and the arrow keys move them; the loader never holds focus or blocks Tab. → Task 4 `keyboardArrows`, Task 3 `loaderNotFocusable`.

---

### Task 1: Test harness, tokens, nav + footer on every page

**Model:** Sonnet

**Files:**
- Create: `tests/harness.mjs`, `tests/layout.test.mjs`, `tests/run-all.sh`, `.gitignore` entry `tests/out/`
- Modify: `css/tokens.css`, `css/site.css`, `index.html`, `impressum.html`, `datenschutz.html`, `404.html`, `locations/nuembrecht.html`, `locations/waldbroel.html`, `README.md` (Figma file → `YyEL9DKmSpeoCDZfqbfjTp`, frames from the spec table)

**Interfaces:**
- Produces: `openPage({ width, height = 900, path = 'index.html', reducedMotion = false, js = true, skipLoader = true }) -> Promise<{ page, errors: string[], close() }>` in `tests/harness.mjs`. It starts one `python3 -m http.server` on 127.0.0.1 per process (a free port, reused across calls), launches chromium headless, appends `?skiploader` to the URL when `skipLoader`, emulates `reducedMotion`, collects `pageerror` and console errors into `errors`, and imports playwright through `createRequire('/home/eddie/Work/Amatsima/Code/studio/node_modules/')`.
- Produces: `assert(cond, msg)` and `report()` (prints PASS/FAIL lines and sets the exit code).
- Produces: `tests/run-all.sh`, which runs every `tests/*.test.mjs` with `node --dns-result-order=ipv4first` and exits non-zero on any failure.

- [ ] **Step 1: Write `tests/layout.test.mjs`**, failing first. For each width in [375, 768, 1440] and each of the 6 pages:
  - `document.documentElement.scrollWidth <= innerWidth`
  - `errors.length === 0`
  - every `img` has `naturalWidth > 0` after scrolling to the bottom
  - the header nav and the footer exist and the footer contains "Nümbrecht" and "Waldbröl"

  For index only: section order matches the spec — `.hero, .intro, .services, .about, .gallery, .locations, .social, .news, footer`.
- [ ] **Step 2: Run** `bash tests/run-all.sh`. Expected: FAIL (`.gallery` missing).
- [ ] **Step 3: Update `css/tokens.css`** from the new file. Get values with `get_variable_defs` / `get_design_context` on `64:2`, and keep each existing token name whose value still exists. Port the Nav (`96:142` / `96:154`) and Footer (`103:14`) into all six pages without changing the logo menu's markup hooks. Add a `.gallery` section (Location Gallery `73:61`) as a placeholder `<section class="gallery">` for Task 2 to fill.
- [ ] **Step 4: Run** `bash tests/run-all.sh`. Expected: PASS.
- [ ] **Step 5: Save** 1440 and 450 screenshots of the nav and footer to `tests/out/` for the reviewer to compare with Figma.
- [ ] **Step 6: Commit** `feat: test harness, v2 tokens, nav and footer on all pages`

### Task 2: Home page sections to Figma v2

**Model:** Sonnet

**Files:**
- Modify: `index.html`, `css/site.css`
- Add: new images in `assets/` (named in lowercase like `dsc00594.jpg`, JPG at ≤ 2× display size)
- Test: `tests/layout.test.mjs` (extend)

**Interfaces:**
- Produces markup hooks that later tasks consume:
  - `.services .orbit` containing 8 `.orbit__item > img`, in Figma order (3 above, 2 beside, 3 below the heading)
  - `.about .carousel[data-carousel="team"]` containing 8 `.carousel__item > img` that are 1:1. Crop the extra photos from the file's DSC images or `assets/` to squares, and keep the 3 Figma photos first.
  - `.social .carousel[data-carousel="social"]` containing 4 grey placeholder `.carousel__item`
  - `.locations .locations__aside` (label + Termin Buchen) next to `.locations__media` (two 16:9 images)
  - `.news .stack` containing `.stack__layer` × 3 (2 announcement cards + the video placeholder from Frame 35, which has `aria-label="Video folgt"`)
  - The hero keeps `TODO(video)`.

- [ ] **Step 1: Extend the layout test** to assert all those hooks exist with the counts above, and that the team images have an aspect ratio of 1 ± 0.02.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Rebuild each home section** from `64:2` (desktop) and `76:222` (mobile, used as the ≤ 600px breakpoint) using `get_design_context` per section node id. Static layout only, no motion. Without JS, carousels render as a horizontal scroll-snap row (`overflow-x: auto; scroll-snap-type: x mandatory`).
- [ ] **Step 4: Run.** Expected: PASS. Save per-section screenshots at 1440 and 450 to `tests/out/sections/`.
- [ ] **Step 5: Commit** `feat: home page sections from Figma v2`

### Task 3: Loader (home only)

**Model:** Sonnet

**Files:**
- Create: `js/loader.js`, `css/loader.css`, `tests/loader.test.mjs`
- Modify: `index.html` (inline head script, loader markup, the CSS link, the scripts, and the single ScrollTrigger 3.12.5 tag after gsap). Add `window.mtmReady = Promise.resolve()` inline on the other five pages.

**Interfaces:**
- Produces: `window.mtmReady: Promise<void>`. It resolves when the loader finishes, after any `?skiploader`, after the hard timeout, or immediately on pages without a loader.
- Produces: `html` classes `js` (set by the inline head script), then `is-loading`, then `is-loaded`.
- Markup: `<div class="loader" aria-hidden="true"><div class="loader__dome"></div><div class="loader__panel"></div><div class="loader__count"><span class="loader__num">0</span></div></div>`, visible only under `html.js`.

- [ ] **Step 1: Write `tests/loader.test.mjs`** (with `skipLoader: false`):
  - `.loader` is visible at 100ms.
  - At 1000ms the `.loader__num` text is an integer in [1, 99].
  - The text reaches `100` before the reveal starts.
  - `.loader` is gone from the DOM by 5000ms, and `html` has `is-loaded`.
  - `impressum.html` has no `.loader`.
  - With `js: false`, `main` is visible and `.loader` is computed `display: none`.
  - With `reducedMotion: true`, `is-loaded` arrives within 600ms.
  - `deepLinkLandsOnStandorte`: `index.html#standorte` → after `is-loaded`, `#standorte` has rect.top within [-10, innerHeight/2].
  - `hardTimeoutClears`: block all `assets/*` requests with `page.route` → `is-loaded` arrives by 6500ms.
  - `loaderNotFocusable`: while the loader is running, `document.activeElement` is never inside `.loader`, and the loader has no focusable descendants.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement `js/loader.js`** with this timeline:
  - Count 0 → 100 over 2.0s; each number change rolls (new number `yPercent 100 → 0`, old `0 → -100`).
  - Dome `yPercent → -100` over 0.6s.
  - Panel moves up over 0.9s, its bottom edge animating to the elliptical curve of `92:40` (`clip-path: ellipse()` or `border-radius`).
  - All `sine.inOut`. Then remove `.loader`, set `is-loaded`, resolve `mtmReady`, call `ScrollTrigger.refresh()`, and re-apply `location.hash` scrolling.
  - Lock scroll only while running.
- [ ] **Step 4: Run.** Expected: PASS. Save frames at 200ms, 1s, 2.2s and 2.8s to `tests/out/loader/` (desktop + 375).
- [ ] **Step 5: Commit** `feat: home page loader`

### Task 4: Infinite click carousels (team + social)

**Model:** Sonnet

**Files:**
- Create: `js/carousel.js`, `css/carousel.css`, `tests/carousel.test.mjs`
- Modify: `index.html` (link the CSS; the script after `loader.js`)

**Interfaces:**
- Consumes: `.carousel[data-carousel] > .carousel__item` (Task 2), `window.mtmReady` (Task 3).
- Produces: `initCarousel(root: HTMLElement) -> { next(): void, prev(): void, goTo(i: number): void, index(): number }`, also stored on `root.__carousel`. It inserts `.carousel__glass--left` and `.carousel__glass--right`, adds `tabindex="0"` to root, and gives JS-enhanced roots the class `is-enhanced`.
- Edge distortion is applied every tick from each item's centre offset `t = clamp((cx − mid) / mid, −1, 1)`: `skewY = 8·t deg`, `scaleX = 1 + 0.25·t²`. Glass strips are 12vw wide (8vw at ≤ 600px) with `backdrop-filter: blur(12px)`. A move lasts 0.6s with `sine.inOut`. The loop clones items as needed so no gap appears in either direction.

- [ ] **Step 1: Write `tests/carousel.test.mjs`** at 1440 and 375, for both carousels:
  - Click the item right of centre → after 800ms `index()` has increased by 1 (mod n) and that item's centre is within 2% of the root's centre.
  - The centre item has |skewY| < 1°; the outermost visible item has |skewY| > 4°.
  - `rapidClicksNoGaps`: 6 clicks 80ms apart, wait 1s → `index()` equals the start + 6 (mod n), and every 20px sample across the root's width hits a `.carousel__item`.
  - Going backwards 10 times wraps the same way.
  - `keyboardArrows`: focus the root, press ArrowRight → `index()` +1.
  - `resizeRemeasures`: load at 1440, resize to 375, wait 500ms → the centre item is centred within 2%, with no page overflow.
  - `reducedMotion`: no item has a non-identity transform, and the root has computed `overflow-x: auto`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `initCarousel` as specified; run it on all `.carousel` elements after `mtmReady`. Under reduced motion, return early (the fallback stays).
- [ ] **Step 4: Run.** Expected: PASS. Save screenshots of each carousel mid-move at 1440 and 375 to `tests/out/carousel/`.
- [ ] **Step 5: Commit** `feat: infinite click carousels with glass edge distortion`

### Task 5: Sticky Nümbrecht aside + booking links

**Model:** Haiku

**Files:**
- Modify: `css/site.css`, `index.html`, `locations/nuembrecht.html`, `locations/waldbroel.html`, `js/menu.js` (booking-link line only)
- Create: `tests/locations.test.mjs`

**Interfaces:**
- Consumes: `.locations__aside`, `.locations__media` (Task 2).

- [ ] **Step 1: Write `tests/locations.test.mjs`**:
  - At 1440 and 375, scroll so that `.locations__media` moves through 3 positions while the aside is in range → `.locations__aside` rect.top is the same (±2px) at all 3 positions while the image rect.top changes by > 100px.
  - The Nümbrecht-specific buttons and every button on `locations/nuembrecht.html` have href `https://www.planity.com/de-DE/mtm-coiffure-by-mo-51588-numbrecht`; the Waldbröl ones have `https://www.planity.com/de-DE/mtm-coiffure-by-abdul-51545-waldbrol`; all Planity links have `target="_blank"` and `rel` containing `noopener`.
  - Generic Termin Buchen buttons still point to `#standorte`.
  - No `TODO(content): real booking URL` remains (`grep`).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Use `position: sticky; top: <nav height + 2vh>` on `.locations__aside` inside a grid whose row spans `.locations__media`. Update the links. In `js/menu.js`, keep the menu's generic Termin buchen item on `#standorte` and remove only its booking TODO comment.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: sticky Nümbrecht aside and Planity booking links`

### Task 6: News stack

**Model:** Haiku

**Files:**
- Create: `js/stack.js`, `tests/stack.test.mjs`
- Modify: `css/site.css`, `index.html`

**Interfaces:**
- Consumes: `.news .stack > .stack__layer` × 3 (Task 2), `window.mtmReady`.

- [ ] **Step 1: Write `tests/stack.test.mjs`** at 1440 and 375:
  - Each layer is `position: sticky`.
  - When layer 2 fully covers layer 1, layer 1 has computed opacity 0.35 ± 0.05 and scale 0.92 ± 0.01.
  - When layer 3 covers layer 2, layer 2 is the same, and layer 1 is ≤ its previous values.
  - Layer 3 ends at opacity 1, scale 1.
  - The stack's scroll length is ≤ 3.2 × innerHeight.
  - Under reduced motion, layers are not sticky and have no transforms.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** CSS sticky layers (stacked top offsets 0); for each covered layer, one ScrollTrigger scrubs `scale` → 0.92 and `opacity` → 0.35 (`sine.inOut`), triggered by the next layer's top moving from viewport bottom to sticky top.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: stacked news cards with depth`

### Task 7: Scroll-linked image orbit

**Model:** Sonnet

**Files:**
- Create: `js/orbit.js`, `css/orbit.css`, `tests/orbit.test.mjs`
- Modify: `index.html`
- Reference (read, don't copy blindly): `/home/eddie/Work/Amatsima/Code/Freigeist/code/orbit-assembly/orbit-assembly-embed.html` and `/home/eddie/Work/Amatsima/Code/Freigeist/site/reference/2026-08-19-orbit-assembly-phase1.md`. Those describe polar motion: a spin layer → an arm layer (angle) → a card layer (x radius, scale) → a face layer (counter-spin + Figma tilt). Each property is owned by exactly one tween.

**Interfaces:**
- Consumes: `.services .orbit > .orbit__item > img` × 8 (Task 2), `window.mtmReady`.
- Produces: `initOrbit(root: HTMLElement) -> { progress(): number }` on `root.__orbit`. JS wraps each item in `.orbit__arm` and `.orbit__face`.
- Motion is scrubbed over the section's pass through the viewport (trigger `top bottom` → `bottom top`):
  - Entry happens in the first 40%. Items start off-screen left (the first 4) or right (the last 4) at scale 1.6 and spiral to their Figma ring angle at scale 1.0.
  - Then the ring rotates 90° by the end.
  - Faces counter-spin so each photo keeps its Figma tilt.
  - The ring radius comes from the measured Figma layout (`64:2`, and `76:222` at ≤ 600px) and is recomputed on resize.

- [ ] **Step 1: Write `tests/orbit.test.mjs`** at 1440 and 375, sampling 5 scroll positions across the section:
  - Each item's centre differs between consecutive samples.
  - At the first sample, the mean item scale is > 1.3; at 50% progress, all items have scale 1.0 ± 0.05 and lie inside the viewport.
  - At every sample from 50% progress on, each face's net rotation (arm + spin + face) equals its Figma tilt ± 2°.
  - `orbitResizeInsideViewport`: load at 1440, scroll to 50%, resize to 375, wait 500ms → all items are inside the viewport.
  - Under reduced motion, the formed ring is static (positions are identical across samples).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `initOrbit` as specified.
- [ ] **Step 4: Run.** Expected: PASS. Save 5-sample screenshots at 1440 and 375 to `tests/out/orbit/`.
- [ ] **Step 5: Commit** `feat: scroll-linked image orbit around the services CTA`

### Task 8: Whole-site verification

**Model:** run by Claude (controller)

- [ ] **Step 1:** Run `bash tests/run-all.sh`. Expected: all PASS, 0 console errors.
- [ ] **Step 2:** Check that `grep -c 'gsap/3.12.5/gsap.min.js'` and `grep -c 'ScrollTrigger.min.js'` give ≤ 1 per page.
- [ ] **Step 3:** Compare `tests/out/` screenshots with Figma `get_screenshot` of each section at 1440 and 450, and list the differences.
- [ ] **Step 4:** Do a real-wheel scroll pass through the whole home page at 1440 and 375 (`page.mouse.wheel` in 200px steps), with no console errors and no overflow.
- [ ] **Step 5:** Ask the user for the go-ahead, then push the branch and open a PR to `main`. Do not merge (the user merges).
