/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import path from 'node:path';

const from = path.resolve('src/core/inspect_helper.py');
const toDir = path.resolve('dist/core');
fs.mkdirSync(toDir, { recursive: true });
fs.copyFileSync(from, path.join(toDir, 'inspect_helper.py'));
console.log('Copied inspect_helper.py');
