#!/usr/bin/env node
// Checks that the parts the salon owner edits in Forge are still marked: every key in .forge-edit.json sits on at
// least one page, no page carries a key the manifest doesn't know, and the lists (reviews, FAQ) still start with
// their item template. It also compares where each key sits with .forge-edit.lock.json, so a marker that vanishes
// from one page is caught even while the same key is still on another. Run on every pull request
// (.github/workflows/forge-edit.yml), so a design sync or a hand edit that drops a data-edit attribute shows up
// before it reaches the live site. No dependencies.
//
//   node tools/check-forge-edit.mjs           check
//   node tools/check-forge-edit.mjs --write   record where the markers are now (after adding or moving one on purpose)
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, '.forge-edit.json'), 'utf8'));
const problems = [];

/** The manifest's file globs: `*` stands for one file name inside one folder. */
function expand(glob) {
  if (!glob.includes('*')) return existsSync(join(root, glob)) ? [glob] : [];
  const dir = posix.dirname(glob);
  const name = new RegExp('^' + posix.basename(glob).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
  if (dir.includes('*') || !existsSync(join(root, dir))) return [];
  return readdirSync(join(root, dir)).filter((f) => name.test(f)).sort().map((f) => posix.join(dir, f));
}

const files = [...new Set(manifest.files.flatMap(expand))];
if (files.length === 0) problems.push('.forge-edit.json names no page that exists');

const fields = new Map(manifest.fields.map((f) => [f.key, f]));
const seen = new Set();
const placed = {};
for (const file of files) {
  placed[file] = {};
  const html = readFileSync(join(root, file), 'utf8');
  for (const m of html.matchAll(/<([a-zA-Z][\w-]*)\b[^>]*?\sdata-edit="([^"]*)"[^>]*>/g)) {
    const [tag, , key] = m;
    const field = fields.get(key);
    if (!field) { problems.push(`${file}: data-edit="${key}" is not in .forge-edit.json`); continue; }
    seen.add(key);
    placed[file][key] = (placed[file][key] ?? 0) + 1;
    if (field.type === 'faq' || field.type === 'reviews') {
      const after = html.slice(m.index + tag.length, m.index + tag.length + 400);
      if (!/^\s*(<!--[\s\S]*?-->\s*)*<template\s+data-edit-item\s*>/.test(after)) {
        problems.push(`${file}: the ${key} list must start with <template data-edit-item>`);
      }
    }
  }
}
for (const key of fields.keys()) if (!seen.has(key)) problems.push(`${key} is in .forge-edit.json but marked on no page`);

const lockPath = join(root, '.forge-edit.lock.json');
const sorted = Object.fromEntries(Object.keys(placed).sort().map((f) => [f, Object.fromEntries(Object.keys(placed[f]).sort().map((k) => [k, placed[f][k]]))]));
if (process.argv.includes('--write')) {
  if (problems.length === 0) writeFileSync(lockPath, JSON.stringify(sorted, null, 2) + '\n');
} else if (!existsSync(lockPath)) {
  problems.push('.forge-edit.lock.json is missing; run node tools/check-forge-edit.mjs --write');
} else {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  for (const file of new Set([...Object.keys(lock), ...Object.keys(sorted)])) {
    for (const key of new Set([...Object.keys(lock[file] ?? {}), ...Object.keys(sorted[file] ?? {})])) {
      const was = lock[file]?.[key] ?? 0;
      const now = sorted[file]?.[key] ?? 0;
      if (now < was) problems.push(`${file}: data-edit="${key}" was marked ${was}x and is now marked ${now}x; put the marker back`);
      else if (now > was) problems.push(`${file}: data-edit="${key}" is new here; if that is meant, run node tools/check-forge-edit.mjs --write`);
    }
  }
}

if (problems.length) {
  console.error('Forge edit markers need fixing:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(`ok: ${fields.size} editable parts marked across ${files.length} pages`);
