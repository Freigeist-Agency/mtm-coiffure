# MTM Coiffure — static site

Plain HTML/CSS/JS, no build step. Built from Figma `MTM-Coiffure (Copy)` (file `YyEL9DKmSpeoCDZfqbfjTp`,
desktop frame `64:2`, mobile frame `76:222`; Nav `96:142`/`96:154`, Footer `103:14`, Location Gallery `73:61`).

- Local preview: `node tests/serve.mjs . 8000` in this folder, open http://localhost:8000 (it serves `/impressum` as `impressum.html`, like GitHub Pages; `python3 -m http.server` doesn't, so links would 404 there)
- Staging: work on `staging` (or a branch off it). Every push to a branch other than `main` is uploaded to Cloudflare Pages by `.github/workflows/staging-deploy.yml`: `staging` → https://staging.mtm-coiffure.pages.dev, other branches → `https://<branch>.mtm-coiffure.pages.dev`. These links send `X-Robots-Tag: noindex`.
- Publish (prod): open a pull request `staging` → `main` and merge it with a merge commit. GitHub Pages serves `main` / root. Never edit `main` directly; after an urgent fix there, merge `main` back into `staging`. All paths are relative.
- Clean addresses: the live site never shows `.html` in the address bar. Link to `impressum`, `locations/nuembrecht` and `./` (from `locations/`: `../impressum`, `../`), never `impressum.html` or `index.html`. Canonical tags, `og:url`, `sitemap.xml` and `js/salon-schema.js` use the clean address. The small script first in each page's `<head>` tidies old `.html` links in the address bar. `node tools/check-clean-urls.mjs` checks all of it (it runs on every push).
- Nav and footer markup are copied into every page; change them in all six files.
- Open content: `grep -rn "TODO(" --include=*.html --include=*.js .`
- Tests: `bash tests/run-all.sh` (needs the studio repo's playwright; see `tests/harness.mjs`). `node --dns-result-order=ipv4first tests/shots.mjs` saves nav/footer screenshots to `tests/out/`.

## Editing in Forge

The salon owner changes some parts of the site himself in the Forge portal (Website page; `/edit` on this site sends him there). Freigeist reviews each change, then Forge commits it to `main`.

- `.forge-edit.json` lists the parts he may change: addresses, opening hours, booking links, the six photos, the text under them, the review count, the reviews, the about text, the FAQ and the social links.
- Each part is marked in the HTML with `data-edit="<key>"`. A part that shows in several places (hours in the location card, the location page and every footer) carries the same key everywhere, and Forge rewrites all of them in one commit. Don't remove these attributes, and don't put markup inside a marked element.
- The reviews and the FAQ start with an empty `<template data-edit-item>`: Forge builds each item from it. Change an item's markup there too.
- `tools/build-locations.mjs` reads the addresses, hours and booking links from `index.html`, so a rebuild keeps what the owner changed.
- New photos arrive as `assets/cms/<hash>.webp`.
- `node tools/check-forge-edit.mjs` checks that every part is still marked where it was (it runs on each pull request). After adding or moving a marker on purpose, run it with `--write` and commit `.forge-edit.lock.json`.
- The Figma sync rewrites these pages to match the design. Read its pull request before merging: it must keep the `data-edit` attributes (the check above fails if one is gone), and it must not put the design's placeholder text back over what the owner wrote.
