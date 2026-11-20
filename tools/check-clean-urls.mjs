// Clean addresses: the live site shows /page, never /page.html, in the address bar (Joel, 2026-11-20).
// GitHub Pages (prod) serves page.html at /page; Cloudflare Pages (staging) redirects /page.html to /page.
// This fails when a page links to one of the site's own pages with ".html", when a canonical or share
// address ends in ".html", or when a page lacks the small script that tidies old ".html" links in the address bar.
// node tools/check-clean-urls.mjs [root]
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const SKIP = new Set(['.git', '.github', 'node_modules', 'tests', 'docs', 'tools', 'scripts', 'edit']);
const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) pages.push(p);
  }
})(root);

const problems = [];
for (const file of pages) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  const html = fs.readFileSync(file, 'utf8');
  for (const [, url] of html.matchAll(/\bhref="([^"]*)"/g)) {
    const p = url.split(/[?#]/)[0];
    if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(p) || !p.endsWith('.html')) continue;
    problems.push(`${rel}: link "${url}" ends in .html (write it without, e.g. "${p.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '') || './'}")`);
  }
  for (const [tag] of html.matchAll(/<(?:link[^>]*rel="canonical"|meta[^>]*property="og:url")[^>]*>/g)) {
    if (/\.html"/.test(tag)) problems.push(`${rel}: ${tag} ends in .html`);
  }
  if (path.basename(file) !== '404.html' && !/history\.replaceState\(|location\.pathname\.endsWith\(['"]\.html['"]\)/.test(html)) {
    problems.push(`${rel}: missing the clean-address script (copy it from index.html, right after <meta charset>)`);
  }
}
for (const f of ['sitemap.xml']) {
  const p = path.join(root, f);
  if (fs.existsSync(p)) for (const [, loc] of fs.readFileSync(p, 'utf8').matchAll(/<loc>([^<]*)<\/loc>/g)) {
    if (loc.endsWith('.html')) problems.push(`${f}: ${loc} ends in .html`);
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s). Clean addresses: link to "impressum", not "impressum.html", and to "./" or "../", not "index.html".`);
  process.exit(1);
}
console.log(`ok: ${pages.length} pages use clean addresses`);
