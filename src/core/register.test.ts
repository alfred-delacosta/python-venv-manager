/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findVenvAt, parseBulkFolders, scanRegisterRoot, suggestSlugFromFolder } from './register.js';
import { ValidationError } from './validators.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('register helpers', () => {
  it('finds nested .venv and suggests slugs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pyapps-reg-'));
    dirs.push(root);
    const project = path.join(root, 'My Tool');
    fs.mkdirSync(path.join(project, '.venv'), { recursive: true });
    fs.writeFileSync(path.join(project, '.venv', 'pyvenv.cfg'), 'home = x\n');
    expect(findVenvAt(project)).toBe(path.join(project, '.venv'));
    expect(suggestSlugFromFolder(project)).toBe('my-tool');
    expect(scanRegisterRoot(root)).toHaveLength(1);
  });

  it('rejects non-absolute bulk folders and leading hyphens', () => {
    expect(() => parseBulkFolders(['relative/path'])).toThrow(ValidationError);
    expect(() => parseBulkFolders(['-rf'])).toThrow(ValidationError);
  });
});
