// Shared test harness: static server + headless chromium + tiny assert/report.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire('/home/eddie/Work/Amatsima/Code/studio/node_modules/');
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

export async function openPage({
  width, height = 900, path: pagePath = 'index.html',
  reducedMotion = false, js = true, skipLoader = true,
} = {}) {
  serverP ??= startServer();
  browserP ??= chromium.launch({ headless: true });
  const base = await serverP;
  const browser = await browserP;
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    javaScriptEnabled: js,
  });
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
