# MTM Coiffure — static site

Plain HTML/CSS/JS, no build step. Built from Figma `MTM-Coiffure (Copy)` (file `YyEL9DKmSpeoCDZfqbfjTp`,
desktop frame `64:2`, mobile frame `76:222`; Nav `96:142`/`96:154`, Footer `103:14`, Location Gallery `73:61`).

- Local preview: `python3 -m http.server` in this folder, open http://localhost:8000
- Deploy: push to GitHub → Settings → Pages → "Deploy from a branch", `main` / root. All paths are relative.
- Menu: `css/menu.css` + `js/menu.js`, ported from `studio/References/logo-menu-embed.html`. Needs GSAP 3.12.5 (cdnjs), loaded once per page before `js/menu.js`.
- Nav and footer markup are copied into every page; change them in all six files.
- Open content: `grep -rn "TODO(" --include=*.html --include=*.js .`
- Tests: `bash tests/run-all.sh` (needs the studio repo's playwright; see `tests/harness.mjs`). `node --dns-result-order=ipv4first tests/shots.mjs` saves nav/footer screenshots to `tests/out/`.
