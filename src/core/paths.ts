/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import path from 'node:path';

export class PathGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathGuardError';
  }
}

function normalizeForCompare(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function isInsideHome(candidate: string, home: string): boolean {
  const homeNorm = normalizeForCompare(home);
  const candNorm = normalizeForCompare(candidate);
  if (candNorm === homeNorm) return true;
  const prefix = homeNorm.endsWith(path.sep) ? homeNorm : homeNorm + path.sep;
  return candNorm.startsWith(prefix);
}

export function assertInsideHome(candidate: string, home: string): string {
  let realHome: string;
  let realCandidate: string;
  try {
    realHome = fs.realpathSync(home);
  } catch {
    throw new PathGuardError('Home folder does not exist');
  }
  try {
    realCandidate = fs.realpathSync(candidate);
  } catch {
    throw new PathGuardError('Path does not exist');
  }
  if (!isInsideHome(realCandidate, realHome)) {
    throw new PathGuardError('Path must stay inside the home folder');
  }
  return realCandidate;
}

export function isSymlinkOrJunction(target: string): boolean {
  const lstat = fs.lstatSync(target);
  if (lstat.isSymbolicLink()) return true;
  try {
    fs.readlinkSync(target);
    return true;
  } catch {
    return false;
  }
}

export function assertNotSymlinkOrJunction(target: string): void {
  if (isSymlinkOrJunction(target)) {
    throw new PathGuardError('Symlinks are not allowed');
  }
}

export function assertSafeDeleteTarget(target: string, home: string): string {
  // Check the path before realpath so junctions/symlinks cannot be erased by resolution.
  const absolute = path.resolve(target);
  if (fs.existsSync(absolute)) {
    assertNotSymlinkOrJunction(absolute);
  }
  const real = assertInsideHome(target, home);
  if (normalizeForCompare(real) === normalizeForCompare(fs.realpathSync(home))) {
    throw new PathGuardError('Refusing to delete the home folder itself');
  }
  assertNotSymlinkOrJunction(real);
  let current = absolute;
  const homeReal = fs.realpathSync(home);
  while (normalizeForCompare(current) !== normalizeForCompare(homeReal)) {
    if (fs.existsSync(current)) {
      assertNotSymlinkOrJunction(current);
    }
    const parent = path.dirname(current);
    if (normalizeForCompare(parent) === normalizeForCompare(current)) break;
    current = parent;
  }
  return real;
}

export function appDir(home: string, slug: string): string {
  return path.join(home, slug);
}

export function appVenvDir(home: string, slug: string): string {
  return path.join(home, slug, '.venv');
}

export function projectVenvDir(projectFolder: string): string {
  return path.join(projectFolder, '.venv');
}

export function venvPython(venvDir: string): string {
  if (process.platform === 'win32') {
    return path.join(venvDir, 'Scripts', 'python.exe');
  }
  return path.join(venvDir, 'bin', 'python');
}

export function venvScriptsDir(venvDir: string): string {
  return process.platform === 'win32'
    ? path.join(venvDir, 'Scripts')
    : path.join(venvDir, 'bin');
}
