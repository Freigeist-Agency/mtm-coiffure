// Shared test harness: static server + headless chromium + tiny assert/report.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const require = createRequire('/home/eddie/Work/Amatsima/Code/studio/node_modules/');
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'tests/.cache');
// third-party hosts whose flaky network used to fail the suite; served from tests/.cache after the first fetch
const CACHED_HOSTS = /^https?:\/\/(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;
const KEEP_HEADERS = ['content-type', 'access-control-allow-origin', 'cache-control'];
let serverP = null;
let serverProc = null;
let browserP = null;

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function startServer() {
  const port = await freePort();
  serverProc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
    cwd: ROOT, stdio: 'ignore',
  });
  process.on('exit', () => { try { serverProc.kill(); } catch {} });
  const base = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(base); if (r.ok) return base; } catch {}
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('http.server did not start');
}

async function fetchWithRetry(route, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await route.fetch();
      if (res.ok()) return res;
      last = new Error(`HTTP ${res.status()} for ${route.request().url()}`);
    } catch (e) { last = e; }
    await new Promise(r => setTimeout(r, 300 * (i + 1)));
  }
  throw last;
}

async function routeCached(route) {
  const url = route.request().url();
  const key = crypto.createHash('sha256').update(url).digest('hex');
  const bodyFile = path.join(CACHE, key + '.body');
  const metaFile = path.join(CACHE, key + '.json');
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    return await route.fulfill({ status: 200, headers: meta.headers, body: fs.readFileSync(bodyFile) });
  } catch {}
  let res;
  try { res = await fetchWithRetry(route); }
  catch { return route.abort('failed'); }
  const body = await res.body();
  const all = res.headers();
  const headers = {};
  for (const k of KEEP_HEADERS) if (all[k]) headers[k] = all[k];
  fs.mkdirSync(CACHE, { recursive: true });
  const tmp = `${bodyFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, bodyFile);
  fs.writeFileSync(metaFile + `.${process.pid}.tmp`, JSON.stringify({ url, headers }));
  fs.renameSync(metaFile + `.${process.pid}.tmp`, metaFile);
  return route.fulfill({ status: 200, headers, body });
}

export async function openPage({
  width, height = 900, path: pagePath = 'index.html',
  reducedMotion = false, js = true, skipLoader = true,
  live = false, isMobile = false, hasTouch = false,
} = {}) {
  serverP ??= startServer();
  browserP ??= chromium.launch({ headless: true });
  const base = await serverP;
  const browser = await browserP;
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    javaScriptEnabled: js,
    ...(isMobile ? { isMobile: true } : {}),
    ...(hasTouch ? { hasTouch: true } : {}),
  });
  if (!live) await context.route(CACHED_HOSTS, routeCached);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  const url = base + pagePath + (skipLoader ? '?skiploader' : '');
  await page.goto(url, { waitUntil: 'load' });
  return { page, errors, close: () => context.close() };
}

// Call once at the very end of a test file so the browser and server do not hold the process open.
export async function shutdown() {
  if (browserP) { try { await (await browserP).close(); } catch {} browserP = null; }
  if (serverProc) { try { serverProc.kill(); } catch {} serverProc = null; serverP = null; }
}

let failures = 0, passes = 0;
export function assert(cond, msg) {
  if (cond) { passes++; console.log(`PASS ${msg}`); }
  else { failures++; console.log(`FAIL ${msg}`); }
}
export async function report() {
  await shutdown();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exitCode = failures ? 1 : 0;
}
