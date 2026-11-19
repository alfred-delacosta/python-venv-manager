/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import path from 'node:path';

const roots = ['src/client', 'src/server', 'README.md', 'docs', 'AGENTS.md'];
const dashPattern = /[\u2013\u2014]/;
const failures = [];

function walk(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(filePath)) {
      walk(path.join(filePath, entry));
    }
    return;
  }
  if (!/\.(tsx?|jsx?|md|html)$/.test(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (dashPattern.test(line)) {
      failures.push(`${filePath}:${index + 1}: em/en dash found`);
    }
  });
}

for (const root of roots) {
  if (fs.existsSync(root)) walk(root);
}

if (failures.length) {
  console.error('lint:copy failed:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log('lint:copy passed');
