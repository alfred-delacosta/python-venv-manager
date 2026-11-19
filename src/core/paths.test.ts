/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertInsideHome,
  assertSafeDeleteTarget,
  isInsideHome,
  isSymlinkOrJunction,
  PathGuardError,
} from './paths.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('path guards', () => {
  it('allows paths inside home and respects Windows casing', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pyapps-home-'));
    tempDirs.push(home);
    const child = path.join(home, 'app1');
    fs.mkdirSync(child);
    expect(isInsideHome(child, home)).toBe(true);
    if (process.platform === 'win32') {
      expect(isInsideHome(child.toUpperCase(), home.toLowerCase())).toBe(true);
    }
    expect(assertInsideHome(child, home)).toBeTruthy();
  });

  it('rejects traversal outside home', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pyapps-home-'));
    tempDirs.push(home);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'pyapps-out-'));
    tempDirs.push(outside);
    expect(() => assertInsideHome(outside, home)).toThrow(PathGuardError);
  });

  it('refuses deleting the home folder itself', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pyapps-home-'));
    tempDirs.push(home);
    expect(() => assertSafeDeleteTarget(home, home)).toThrow(PathGuardError);
  });

  it('refuses symlink targets when present', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pyapps-home-'));
    tempDirs.push(home);
    const real = path.join(home, 'real');
    fs.mkdirSync(real);
    const link = path.join(home, 'link');
    try {
      fs.symlinkSync(real, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      // Skipping when symlink creation requires elevation
      return;
    }
    expect(fs.existsSync(link)).toBe(true);
    if (!isSymlinkOrJunction(link)) {
      // Some Windows configurations create directory links that Node does not expose.
      return;
    }
    expect(() => assertSafeDeleteTarget(link, home)).toThrow(PathGuardError);
  });
});
