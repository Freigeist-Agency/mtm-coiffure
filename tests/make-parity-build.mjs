// Builds the Figma Make hover-gallery reference (React + GSAP 3.15) into a static folder for tests/make-parity.mjs.
// No install scripts run and nothing inside the Make source is modified: esbuild bundles src/main.tsx (the entry also exposes the
// bundled gsap as window.__makeGsap so the parity harness can pin its ticker), the tailwind compile API turns the classes used
// in src/*.tsx into CSS, and public/ is copied as is.
//   MAKE_SRC   a COPY of references/hover-gallery-make/source (default: tests/.cache/make-run)
//   GSAP_DIR   the unpacked npm tarball of gsap@3.15.0, i.e. the folder that holds package.json (curl the registry .tgz and untar; default: tests/.cache/gsap315/package)
//   NM         a node_modules with esbuild, tailwindcss (v4) and react/react-dom 19
//   MAKE_DIST  output folder (default: tests/.cache/make-dist)
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path';
const SCRATCH = new URL('./.cache', import.meta.url).pathname; // git-ignored; MAKE_SRC is a copy of references/hover-gallery-make/source
const SRC = process.env.MAKE_SRC || SCRATCH + '/make-run';
const GSAP_DIR = process.env.GSAP_DIR || SCRATCH + '/gsap315/package';
const NM = process.env.NM || '/home/eddie/Work/Amatsima/Code/.worktrees/api-tests/node_modules';
const OUT = process.env.MAKE_DIST || SCRATCH + '/make-dist';
const esbuild = createRequire(NM + '/')('esbuild');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(SRC, 'public'), OUT, { recursive: true });
const tw = await import(NM + '/tailwindcss/dist/lib.mjs');
const compiler = await tw.compile(fs.readFileSync(path.join(SRC, 'src/index.css'), 'utf8'), { base: path.join(SRC, 'src'), onDependency() {},
  async loadStylesheet(id, base) {
    const file = id === 'tailwindcss' ? NM + '/tailwindcss/index.css' : path.resolve(base, id);
    return { path: file, base: path.dirname(file), content: fs.readFileSync(file, 'utf8') };
  } });
const cands = new Set();
for (const f of ['src/App.tsx', 'src/main.tsx']) for (const t of fs.readFileSync(path.join(SRC, f), 'utf8').split(/[\s"'`<>{}()=;,]+/)) if (t) cands.add(t);
fs.writeFileSync(path.join(OUT, 'style.css'), compiler.build([...cands]));
await esbuild.build({ stdin: { contents: "import gsap from 'gsap'; window.__makeGsap = gsap; import './src/main.tsx';", resolveDir: SRC, loader: 'tsx' },
  bundle: true, outfile: path.join(OUT, 'app.js'), format: 'esm', jsx: 'automatic', nodePaths: [NM], alias: { gsap: GSAP_DIR },
  define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'empty' }, logLevel: 'error' });
fs.writeFileSync(path.join(OUT, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>make</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
console.log('built ' + OUT);
