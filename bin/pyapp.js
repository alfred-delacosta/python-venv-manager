#!/usr/bin/env node
/* Copyright Advanced Software and AI Solutions LLC */
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const distEntry = path.join(here, '../dist/cli/pyapp.js');
const srcEntry = path.join(here, '../src/cli/pyapp.ts');

async function run() {
  try {
    const mod = await import(pathToFileURL(distEntry).href);
    mod.main(process.argv);
  } catch {
    await import('tsx/esm/api').catch(() => import('tsx'));
    const mod = await import(pathToFileURL(srcEntry).href);
    mod.main(process.argv);
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
