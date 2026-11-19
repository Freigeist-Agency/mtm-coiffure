// The real social accounts (cofounder, 2026-11-16) on every page: each Instagram link goes to https://www.instagram.com/mtm_coiffure/,
// each TikTok link to https://www.tiktok.com/@mtmbyabdul, in a new tab; no placeholder account link is left. The home page has two of
// each (the social section's buttons and the footer), every other page one (the footer); the Impressum two (its Social-Media-Auftritte section and the footer).
import fs from 'node:fs';
import { assert, report } from './harness.mjs';
const IG = 'https://www.instagram.com/mtm_coiffure/', TT = 'https://www.tiktok.com/@mtmbyabdul';
for (const [f, n] of [['index.html', 2], ['impressum.html', 2], ['datenschutz.html', 1], ['404.html', 1], ['locations/nuembrecht.html', 1], ['locations/waldbroel.html', 1]]) {
  const s = fs.readFileSync(f, 'utf8');
  const links = [...s.matchAll(/<a\b[^>]*href="(https:\/\/www\.(instagram|tiktok)\.com[^"]*)"[^>]*>/g)];
  const ig = links.filter(m => m[2] === 'instagram'), tt = links.filter(m => m[2] === 'tiktok');
  assert(ig.length === n && ig.every(m => m[1] === IG && /target="_blank"/.test(m[0])), `${f}: ${n} Instagram link(s) to ${IG}, new tab (${ig.map(m => m[1])})`);
  assert(tt.length === n && tt.every(m => m[1] === TT && /target="_blank"/.test(m[0])), `${f}: ${n} TikTok link(s) to ${TT}, new tab (${tt.map(m => m[1])})`);
}
await report();
