# MTM Coiffure — static site

Plain HTML/CSS/JS, no build step. Built from Figma `MTM-Coiffure (Copy)` (file `YyEL9DKmSpeoCDZfqbfjTp`,
desktop frame `64:2`, mobile frame `76:222`; Nav `96:142`/`96:154`, Footer `103:14`, Location Gallery `73:61`).

- Local preview: `python3 -m http.server` in this folder, open http://localhost:8000
- Staging: work on `staging` (or a branch off it). Every push to a branch other than `main` is uploaded to Cloudflare Pages by `.github/workflows/staging-deploy.yml`: `staging` → https://staging.mtm-coiffure.pages.dev, other branches → `https://<branch>.mtm-coiffure.pages.dev`. These links send `X-Robots-Tag: noindex`.
- Publish (prod): open a pull request `staging` → `main` and merge it with a merge commit. GitHub Pages serves `main` / root. Never edit `main` directly; after an urgent fix there, merge `main` back into `staging`. All paths are relative.
- Nav and footer markup are copied into every page; change them in all six files.
- Open content: `grep -rn "TODO(" --include=*.html --include=*.js .`
- Tests: `bash tests/run-all.sh` (needs the studio repo's playwright; see `tests/harness.mjs`). `node --dns-result-order=ipv4first tests/shots.mjs` saves nav/footer screenshots to `tests/out/`.
